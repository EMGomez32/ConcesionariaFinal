import { Prisma } from '@prisma/client';
import { normalizarTelefono } from '../../../domain/services/telefono';

/**
 * SUPRESIÓN DEL TITULAR (art. 16 Ley 25.326; ISO 27701 A.7.4.5 / A.7.3.6) — el núcleo
 * que comparten el botón "Suprimir datos" de la ficha y el script de retención.
 *
 * Trabaja SIEMPRE sobre un `tx` RAW (sin la extensión de Prisma), así que:
 *   - cada where lleva el `concesionariaId` EXPLÍCITO (la RLS sólo filtra bajo app_rw,
 *     y el script corre con la conexión de migraciones, que es superusuario);
 *   - los where NO se filtran por `deletedAt`: lo dado de baja también es dato del
 *     titular y también se suprime.
 *
 * QUÉ SE CONSERVA. La ley obliga a guardar los registros contables y fiscales (Código
 * Civil y Comercial art. 328; Ley 11.683 para lo impositivo) y la supresión no procede
 * cuando "pudiese causar perjuicios a derechos o intereses legítimos de terceros, o
 * cuando existiera una obligación legal de conservar los datos" (art. 16 inc. 5). Por
 * eso, si el cliente tiene operaciones con plata —ventas, comprobantes AFIP, reservas,
 * financiaciones o un auto que le compró la concesionaria— la supresión es PARCIAL:
 *   - quedan los datos de identificación que esas operaciones necesitan (nombre,
 *     apellido, documento, condición de IVA, domicilio) y, si hay una financiación sin
 *     cerrar, también el teléfono y el email (hacen falta para cobrarla);
 *   - las operaciones mismas (ventas, pagos, cuotas, reservas, postventa) NO se tocan;
 *   - todo lo demás se borra igual que en la supresión total, y la ficha queda
 *     BLOQUEADA (no se la contacta ni se la usa para nada más que esa obligación).
 * Sin operaciones la supresión es TOTAL: la ficha se anonimiza y se da de baja.
 *
 * Los BINARIOS de los adjuntos (DNI, recibos de sueldo) no se borran acá: el borrado de
 * un archivo no es transaccional. Se devuelven sus `storageKeys` y quien llama los borra
 * DESPUÉS del commit — si la transacción falla, no queda una fila apuntando a un
 * archivo que ya no existe.
 */

export const NOMBRE_SUPRIMIDO = 'Titular suprimido';
export const MARCA_SUPRIMIDO = '[Suprimido a pedido del titular]';

export interface ObligacionesConservacion {
    ventas: number;
    comprobantesAfip: number;
    reservas: number;
    /** Financiaciones activas o en mora: la relación contractual sigue viva. */
    financiacionesAbiertas: number;
    /** Ingresos de stock donde el cliente VENDIÓ (o entregó) el auto: hay un boleto. */
    ingresosComoVendedor: number;
    hayObligacion: boolean;
    /** Frases para la respuesta al titular: qué obligación impide suprimir del todo. */
    motivos: string[];
}

/** Qué operaciones del cliente obligan a conservar datos. Cuenta también lo dado de baja. */
export async function evaluarObligaciones(
    tx: Prisma.TransactionClient,
    concesionariaId: number,
    clienteId: number,
): Promise<ObligacionesConservacion> {
    const [ventas, comprobantesAfip, reservas, financiacionesAbiertas, ingresosComoVendedor] = await Promise.all([
        tx.venta.count({ where: { concesionariaId, clienteId } }),
        tx.comprobanteAfip.count({ where: { concesionariaId, venta: { clienteId } } }),
        tx.reserva.count({ where: { concesionariaId, clienteId } }),
        tx.financiacion.count({ where: { concesionariaId, clienteId, deletedAt: null, estado: { in: ['activa', 'en_mora'] } } }),
        tx.ingresoVehiculo.count({ where: { concesionariaId, clienteOrigenId: clienteId } }),
    ]);

    const motivos: string[] = [];
    if (ventas > 0) motivos.push(`${ventas} venta(s): registro contable que hay que conservar`);
    if (comprobantesAfip > 0) motivos.push(`${comprobantesAfip} comprobante(s) AFIP: obligación fiscal`);
    if (reservas > 0) motivos.push(`${reservas} reserva(s) o seña(s): registro de la operación`);
    if (financiacionesAbiertas > 0) motivos.push(`${financiacionesAbiertas} financiación(es) sin cancelar: contrato vigente`);
    if (ingresosComoVendedor > 0) motivos.push(`${ingresosComoVendedor} unidad(es) que la concesionaria le compró o recibió: boleto de la operación`);

    return {
        ventas,
        comprobantesAfip,
        reservas,
        financiacionesAbiertas,
        ingresosComoVendedor,
        hayObligacion: motivos.length > 0,
        motivos,
    };
}

export interface ResultadoSupresion {
    clienteId: number;
    modo: 'total' | 'parcial';
    obligaciones: ObligacionesConservacion;
    /** Qué datos de la ficha se conservaron (vacío en la total). */
    conservado: string[];
    /** Cuántas filas se tocaron por categoría (para la respuesta y el rastro). */
    suprimido: Record<string, number>;
    /** Binarios a borrar DESPUÉS del commit. */
    storageKeys: string[];
}

export class ClienteYaSuprimidoError extends Error {
    constructor(public readonly clienteId: number) {
        super(`El cliente ${clienteId} ya fue suprimido`);
    }
}

export class ClienteNoEncontradoError extends Error {
    constructor(public readonly clienteId: number) {
        super(`Cliente ${clienteId} no encontrado`);
    }
}

/**
 * Hilos de la bandeja del titular: los vinculados a la ficha y los SUELTOS que vienen
 * del mismo teléfono (forma canónica idéntica, no "parecida"). Un hilo suelto con el
 * mismo número es la misma persona escribiendo antes de que la registraran; dejarlo
 * fuera sería dejar sus mensajes en la base después de "suprimirla".
 */
export async function conversacionesDelTitular(
    tx: Prisma.TransactionClient,
    concesionariaId: number,
    cliente: { id: number; telefonoNormalizado: string | null; telefono: string | null },
): Promise<number[]> {
    const vinculadas = await tx.conversacion.findMany({
        where: { concesionariaId, clienteId: cliente.id },
        select: { id: true },
    });
    const ids = new Set(vinculadas.map((c) => c.id));

    const canonico = cliente.telefonoNormalizado ?? (cliente.telefono ? normalizarTelefono(cliente.telefono) : null);
    if (canonico && canonico.length >= 6) {
        const sufijo = canonico.slice(-4);
        const sueltas = await tx.conversacion.findMany({
            where: { concesionariaId, clienteId: null, telefono: { endsWith: sufijo } },
            select: { id: true, telefono: true },
        });
        for (const c of sueltas) {
            if (c.telefono && normalizarTelefono(c.telefono) === canonico) ids.add(c.id);
        }
    }
    return [...ids];
}

/**
 * Ejecuta la supresión dentro de `tx`. Ver el encabezado del archivo para la regla
 * total / parcial. Lanza `ClienteNoEncontradoError` si la ficha no existe en esa
 * concesionaria y `ClienteYaSuprimidoError` si ya se suprimió.
 */
export async function suprimirTitular(
    tx: Prisma.TransactionClient,
    params: { concesionariaId: number; clienteId: number; motivo: string; ahora?: Date },
): Promise<ResultadoSupresion> {
    const { concesionariaId, clienteId } = params;
    const ahora = params.ahora ?? new Date();

    // Sin filtro de `deletedAt`: una ficha dada de baja sigue guardando los datos y
    // también tiene que poder suprimirse.
    const cliente = await tx.cliente.findFirst({ where: { id: clienteId, concesionariaId } });
    if (!cliente) throw new ClienteNoEncontradoError(clienteId);
    if (cliente.suprimidoEn) throw new ClienteYaSuprimidoError(clienteId);

    const obligaciones = await evaluarObligaciones(tx, concesionariaId, clienteId);
    const modo: 'total' | 'parcial' = obligaciones.hayObligacion ? 'parcial' : 'total';
    const conservarContacto = obligaciones.financiacionesAbiertas > 0;
    const suprimido: Record<string, number> = {};

    // ── Hilos de la bandeja: se buscan ANTES de tocar el teléfono de la ficha. ──
    const conversacionIds = await conversacionesDelTitular(tx, concesionariaId, cliente);

    // ── 1. La ficha ─────────────────────────────────────────────────────────────
    const conservado: string[] = [];
    const data: Prisma.ClienteUncheckedUpdateInput = {
        observaciones: null,
        consentimientoContacto: false,
        consentimientoRevocadoEn: cliente.consentimientoRevocadoEn ?? ahora,
        bloqueadoEn: cliente.bloqueadoEn ?? ahora,
        suprimidoEn: ahora,
    };
    if (modo === 'total') {
        Object.assign(data, {
            nombre: NOMBRE_SUPRIMIDO,
            apellido: null,
            dni: null,
            tipoDoc: null,
            condicionIva: null,
            telefono: null,
            telefonoNormalizado: null,
            email: null,
            direccion: null,
            bloqueoMotivo: `Supresión total: ${params.motivo}`.slice(0, 500),
            // Sin nada que conservar, la ficha también sale de los listados.
            deletedAt: cliente.deletedAt ?? ahora,
        });
    } else {
        conservado.push('nombre y apellido', 'documento y condición frente al IVA', 'domicilio');
        if (conservarContacto) {
            conservado.push('teléfono y email (hay una financiación sin cancelar)');
        } else {
            Object.assign(data, { telefono: null, telefonoNormalizado: null, email: null });
        }
        data.bloqueoMotivo = (
            `Supresión parcial por obligación legal de conservar (${obligaciones.motivos.join('; ')}). ` +
            `Los datos quedan bloqueados: sólo se usan para cumplir esa obligación. Pedido: ${params.motivo}`
        ).slice(0, 1000);
    }
    await tx.cliente.update({ where: { id: clienteId }, data });
    suprimido.ficha = 1;

    // ── 2. Bitácora comercial: la nota libre es el dato; la fila (fecha, tipo) no. ─
    suprimido.seguimientos = (await tx.clienteSeguimiento.updateMany({
        where: { concesionariaId, clienteId },
        data: { nota: MARCA_SUPRIMIDO, proximoContactoHecho: true },
    })).count;

    // ── 3. Atenciones: observaciones y el relevamiento de capacidad económica. ────
    suprimido.atenciones = (await tx.atencion.updateMany({
        where: { concesionariaId, clienteId },
        data: {
            observaciones: null,
            presupuestoMin: null,
            presupuestoMax: null,
            anticipo: null,
            cuotaMaxima: null,
            presupuestoRealCalculado: null,
        },
    })).count;

    suprimido.intereses = (await tx.vehiculoInteres.updateMany({
        where: { concesionariaId, clienteId },
        data: { nota: null },
    })).count;

    // ── 4. Tasaciones del usado del titular: el dominio lo identifica. ────────────
    suprimido.tasaciones = (await tx.tasacion.updateMany({
        where: { concesionariaId, clienteId },
        data: { dominio: null, observaciones: null },
    })).count;

    // ── 5. Presupuestos: se conservan los importes, se va el texto libre. ─────────
    suprimido.presupuestos = (await tx.presupuesto.updateMany({
        where: { concesionariaId, clienteId },
        data: { observaciones: null },
    })).count;
    await tx.presupuestoCanje.updateMany({
        where: { presupuesto: { concesionariaId, clienteId } },
        data: { dominio: null, observaciones: null },
    });

    // ── 6. Solicitudes de financiación: los adjuntos (DNI, recibos) se borran. ────
    // No hay obligación de la concesionaria de guardar el legajo que armó para el
    // banco: el crédito, si salió, lo documenta la financiera.
    const solicitudes = await tx.solicitudFinanciacion.findMany({
        where: { concesionariaId, clienteId },
        select: { id: true },
    });
    const solicitudIds = solicitudes.map((s) => s.id);
    let storageKeys: string[] = [];
    if (solicitudIds.length > 0) {
        await tx.solicitudFinanciacion.updateMany({
            where: { concesionariaId, id: { in: solicitudIds } },
            data: { observaciones: null },
        });
        const archivos = await tx.solicitudFinanciacionArchivo.findMany({
            where: { solicitudId: { in: solicitudIds } },
            select: { id: true, storageKey: true },
        });
        storageKeys = archivos.map((a) => a.storageKey).filter((k): k is string => !!k);
        suprimido.adjuntos = (await tx.solicitudFinanciacionArchivo.deleteMany({
            where: { id: { in: archivos.map((a) => a.id) } },
        })).count;
    }
    suprimido.solicitudesFinanciacion = solicitudIds.length;

    // ── 7. Bandeja: el contenido de los mensajes y los identificadores del contacto. ─
    if (conversacionIds.length > 0) {
        // Primero: nada que siga en cola sale después de la supresión.
        await tx.mensajeWhatsapp.updateMany({
            where: { concesionariaId, conversacionId: { in: conversacionIds }, estado: { in: ['pendiente', 'enviando'] } },
            data: { estado: 'fallido', errorMensaje: 'Cancelado: el titular pidió la supresión de sus datos' },
        });
        suprimido.mensajes = (await tx.mensajeWhatsapp.updateMany({
            where: { concesionariaId, conversacionId: { in: conversacionIds } },
            data: { contenido: MARCA_SUPRIMIDO, mediaUrl: null, mediaMimeType: null, externoId: null },
        })).count;
        // `claveHilo` lleva el teléfono (`<cuenta>:<telefono>`) y es NOT NULL + unique:
        // se reemplaza por una clave que no identifica a nadie y no choca con nada. Si
        // la persona vuelve a escribir, entra como un hilo nuevo.
        for (const id of conversacionIds) {
            await tx.conversacion.update({
                where: { id },
                data: {
                    claveHilo: `suprimido:${id}`,
                    telefono: null,
                    jid: null,
                    contactoExternoId: null,
                    comentarioExternoId: null,
                    nombreContacto: NOMBRE_SUPRIMIDO,
                    estado: 'archivada',
                    noLeidos: 0,
                    deletedAt: ahora,
                },
            });
        }
    }
    suprimido.conversaciones = conversacionIds.length;

    // ── 8. Preguntas de Mercado Libre vinculadas a la ficha. ──────────────────────
    suprimido.preguntasMl = (await tx.preguntaMl.updateMany({
        where: { concesionariaId, clienteId },
        data: { texto: MARCA_SUPRIMIDO, respuesta: null, nombreContacto: null, mlFromUserId: null },
    })).count;

    return { clienteId, modo, obligaciones, conservado, suprimido, storageKeys };
}

/** Borra binarios después del commit. Best-effort: un archivo que ya no está no es error. */
export async function borrarBinarios(
    storageKeys: string[],
    borrar: (storageKey: string) => Promise<void>,
): Promise<{ borrados: number; fallidos: number }> {
    let borrados = 0;
    let fallidos = 0;
    for (const k of storageKeys) {
        try {
            await borrar(k);
            borrados++;
        } catch {
            fallidos++;
        }
    }
    return { borrados, fallidos };
}
