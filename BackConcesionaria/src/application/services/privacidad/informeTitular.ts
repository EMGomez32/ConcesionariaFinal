import { Prisma } from '@prisma/client';
import { textoDeConsentimiento } from '../../../domain/services/consentimiento';
import { conversacionesDelTitular, ClienteNoEncontradoError } from './supresionTitular';

/**
 * INFORME DEL TITULAR — derecho de acceso y portabilidad (art. 14 Ley 25.326;
 * ISO 27701 A.7.3.8 "proveer copia de la PII tratada").
 *
 * Arma, en un JSON legible y reutilizable, TODO lo que la concesionaria guarda de una
 * persona: la ficha, la bitácora comercial, las visitas, tasaciones, presupuestos,
 * reservas, ventas, financiaciones con sus cuotas y pagos, comprobantes AFIP,
 * solicitudes de financiación (con la LISTA de adjuntos, sin los binarios), postventa,
 * conversaciones con sus mensajes, preguntas de Mercado Libre y los pedidos de derechos
 * que haya hecho antes.
 *
 * Incluye lo DADO DE BAJA (marcado `dadoDeBaja`): una baja lógica no borra el dato, y
 * el titular tiene derecho a saber que sigue guardado.
 *
 * NO incluye datos internos de la concesionaria que no son del titular: costos de
 * compra de las unidades, márgenes, lo que se le pagó a proveedores en postventa, ni
 * el rastro de auditoría (registro de seguridad del sistema). Los vehículos aparecen
 * sólo con marca, modelo, año y dominio.
 *
 * Igual que la supresión, trabaja sobre un `tx` RAW con `concesionariaId` explícito en
 * cada where (ver supresionTitular.ts).
 */

const VEHICULO = { select: { id: true, marca: true, modelo: true, anio: true, dominio: true } } as const;
const VEHICULO_SIN_DOMINIO = { select: { id: true, marca: true, modelo: true, anio: true } } as const;
const USUARIO = { select: { nombre: true } } as const;

const baja = <T extends { deletedAt?: Date | null }>(fila: T): T & { dadoDeBaja: boolean } => ({
    ...fila,
    dadoDeBaja: !!fila.deletedAt,
});

export async function armarInformeTitular(
    tx: Prisma.TransactionClient,
    params: { concesionariaId: number; clienteId: number; ahora?: Date },
) {
    const { concesionariaId, clienteId } = params;
    const ahora = params.ahora ?? new Date();

    const cliente = await tx.cliente.findFirst({
        where: { id: clienteId, concesionariaId },
        include: { vendedorAsignado: USUARIO },
    });
    if (!cliente) throw new ClienteNoEncontradoError(clienteId);

    const concesionaria = await tx.concesionaria.findUnique({
        where: { id: concesionariaId },
        select: { id: true, nombre: true, razonSocial: true, cuit: true, email: true, telefono: true, direccion: true },
    });

    const delCliente = { concesionariaId, clienteId };
    const conversacionIds = await conversacionesDelTitular(tx, concesionariaId, cliente);

    const [
        seguimientos, atenciones, intereses, tasaciones, presupuestos, reservas, ventas,
        financiaciones, solicitudesFinanciacion, postventa, conversaciones, preguntasMl,
        ingresosComoVendedor, solicitudesTitular,
    ] = await Promise.all([
        tx.clienteSeguimiento.findMany({
            where: delCliente,
            orderBy: { fecha: 'asc' },
            select: { id: true, tipo: true, fecha: true, nota: true, proximoContacto: true, createdAt: true, deletedAt: true, usuario: USUARIO },
        }),
        tx.atencion.findMany({
            where: delCliente,
            orderBy: { iniciadaEn: 'asc' },
            select: {
                id: true, canal: true, motivo: true, estado: true, resultado: true, iniciadaEn: true, cerradaEn: true,
                observaciones: true, modoBusqueda: true, presupuestoMin: true, presupuestoMax: true, anticipo: true,
                cuotaMaxima: true, tipoFinanciamiento: true, moneda: true, deletedAt: true,
                vendedor: USUARIO,
                vehiculos: { select: { tipo: true, accion: true, nivelInteres: true, createdAt: true, vehiculo: VEHICULO_SIN_DOMINIO } },
            },
        }),
        tx.vehiculoInteres.findMany({
            where: delCliente,
            select: { nota: true, createdAt: true, vehiculo: VEHICULO_SIN_DOMINIO },
        }),
        tx.tasacion.findMany({
            where: delCliente,
            orderBy: { fecha: 'asc' },
            select: {
                id: true, marca: true, modelo: true, anio: true, km: true, dominio: true, condicion: true,
                valorEstimado: true, moneda: true, estado: true, fecha: true, observaciones: true, deletedAt: true,
            },
        }),
        tx.presupuesto.findMany({
            where: delCliente,
            orderBy: { fechaCreacion: 'asc' },
            select: {
                id: true, nroPresupuesto: true, fechaCreacion: true, validoHasta: true, estado: true, moneda: true,
                observaciones: true, deletedAt: true, vendedor: USUARIO,
                items: { where: { deletedAt: null }, select: { precioLista: true, descuento: true, precioFinal: true, vehiculo: VEHICULO_SIN_DOMINIO } },
                extras: { where: { deletedAt: null }, select: { descripcion: true, monto: true } },
                canje: { select: { descripcion: true, anio: true, km: true, dominio: true, valorTomado: true, deletedAt: true } },
            },
        }),
        tx.reserva.findMany({
            where: delCliente,
            orderBy: { fecha: 'asc' },
            select: {
                id: true, estado: true, fecha: true, venceEl: true, montoSenia: true, moneda: true, metodo: true,
                referencia: true, observaciones: true, deletedAt: true, vehiculo: VEHICULO,
            },
        }),
        tx.venta.findMany({
            where: delCliente,
            orderBy: { fechaVenta: 'asc' },
            select: {
                id: true, fechaVenta: true, precioVenta: true, moneda: true, formaPago: true, observaciones: true,
                estadoEntrega: true, fechaEntrega: true, deletedAt: true, vehiculo: VEHICULO, vendedor: USUARIO,
                pagos: { where: { deletedAt: null }, select: { fecha: true, monto: true, metodo: true, tipo: true, referencia: true, observaciones: true } },
                extras: { where: { deletedAt: null }, select: { descripcion: true, monto: true } },
                canjes: { where: { deletedAt: null }, select: { valorTomado: true, vehiculo: VEHICULO } },
                comprobanteAfip: {
                    select: {
                        tipoComprobante: true, puntoVenta: true, numero: true, fechaComprobante: true, receptorNombre: true,
                        receptorDocTipo: true, receptorDocNro: true, receptorCondIva: true, moneda: true, neto: true,
                        iva: true, total: true, estado: true, cae: true, caeVencimiento: true,
                    },
                },
            },
        }),
        tx.financiacion.findMany({
            where: delCliente,
            orderBy: { fechaInicio: 'asc' },
            select: {
                id: true, ventaId: true, fechaInicio: true, montoFinanciado: true, moneda: true, cuotas: true,
                diaVencimiento: true, tasaMensual: true, estado: true, observaciones: true, refinanciaAId: true, deletedAt: true,
                cuotasPlan: {
                    where: { deletedAt: null },
                    orderBy: { nroCuota: 'asc' },
                    select: {
                        nroCuota: true, vencimiento: true, montoCuota: true, saldoCuota: true, estado: true, fechaPagoCompleto: true,
                        pagos: { where: { deletedAt: null }, select: { fechaPago: true, monto: true, metodo: true, referencia: true } },
                    },
                },
            },
        }),
        tx.solicitudFinanciacion.findMany({
            where: delCliente,
            orderBy: { createdAt: 'asc' },
            select: {
                id: true, estado: true, montoSolicitado: true, plazoCuotas: true, tasaEstimada: true, fechaEnvio: true,
                fechaRespuesta: true, montoAprobado: true, tasaFinal: true, observaciones: true, createdAt: true, deletedAt: true,
                financiera: { select: { nombre: true } },
                // La LISTA de adjuntos, nunca la URL ni el binario: el informe viaja por
                // mail o queda en una carpeta; una URL firmada adentro sería un acceso
                // al DNI que sobrevive a la sesión de quien lo descargó.
                archivos: { select: { tipo: true, descripcion: true, mimeType: true, sizeBytes: true, createdAt: true } },
            },
        }),
        tx.postventaCaso.findMany({
            where: delCliente,
            orderBy: { fechaReclamo: 'asc' },
            select: {
                id: true, ventaId: true, fechaReclamo: true, tipo: true, descripcion: true, estado: true, montoFacturado: true,
                fechaCierre: true, fechaTurno: true, horaTurno: true, proximoServiceFecha: true, deletedAt: true,
                tipoRef: { select: { nombre: true } }, vehiculo: VEHICULO,
            },
        }),
        conversacionIds.length === 0 ? Promise.resolve([]) : tx.conversacion.findMany({
            where: { concesionariaId, id: { in: conversacionIds } },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true, canal: true, telefono: true, nombreContacto: true, estado: true, createdAt: true, deletedAt: true,
                mensajes: {
                    orderBy: { createdAt: 'asc' },
                    select: { direccion: true, tipo: true, contenido: true, estado: true, createdAt: true, deletedAt: true },
                },
            },
        }),
        tx.preguntaMl.findMany({
            where: delCliente,
            orderBy: { preguntadaEn: 'asc' },
            select: { itemId: true, nombreContacto: true, texto: true, respuesta: true, preguntadaEn: true, respondidaEn: true, deletedAt: true },
        }),
        tx.ingresoVehiculo.findMany({
            where: { concesionariaId, clienteOrigenId: clienteId },
            orderBy: { fechaIngreso: 'asc' },
            select: { tipoIngreso: true, fechaIngreso: true, valorTomado: true, observaciones: true, deletedAt: true, vehiculo: VEHICULO },
        }),
        tx.solicitudTitular.findMany({
            where: delCliente,
            orderBy: { recibidaEl: 'asc' },
            select: { tipo: true, recibidaEl: true, venceEl: true, estado: true, resolucion: true, resueltaEn: true },
        }),
    ]);

    const titular = {
        id: cliente.id,
        nombre: cliente.nombre,
        apellido: cliente.apellido,
        tipoDoc: cliente.tipoDoc,
        documento: cliente.dni,
        condicionIva: cliente.condicionIva,
        telefono: cliente.telefono,
        email: cliente.email,
        direccion: cliente.direccion,
        observaciones: cliente.observaciones,
        etapaComercial: cliente.estadoLead,
        origen: cliente.origenLead,
        vendedorAsignado: cliente.vendedorAsignado?.nombre ?? null,
        alta: cliente.createdAt,
        ultimaInteraccion: cliente.ultimaInteraccionEn,
        dadoDeBaja: !!cliente.deletedAt,
        consentimientoContacto: {
            otorgado: cliente.consentimientoContacto,
            otorgadoEn: cliente.consentimientoEn,
            version: cliente.consentimientoVersion,
            textoInformado: textoDeConsentimiento(cliente.consentimientoVersion),
            revocadoEn: cliente.consentimientoRevocadoEn,
        },
        bloqueo: cliente.bloqueadoEn ? { desde: cliente.bloqueadoEn, motivo: cliente.bloqueoMotivo } : null,
        suprimidoEn: cliente.suprimidoEn,
    };

    const secciones = {
        seguimientos: seguimientos.map(({ usuario, ...s }) => baja({ ...s, registradoPor: usuario?.nombre ?? null })),
        atenciones: atenciones.map(({ vendedor, ...a }) => baja({ ...a, atendidoPor: vendedor?.nombre ?? null })),
        interesesEnVehiculos: intereses,
        tasaciones: tasaciones.map(baja),
        presupuestos: presupuestos.map(({ vendedor, ...p }) => baja({ ...p, vendedor: vendedor?.nombre ?? null })),
        reservas: reservas.map(baja),
        ventas: ventas.map(({ vendedor, ...v }) => baja({ ...v, vendedor: vendedor?.nombre ?? null })),
        financiaciones: financiaciones.map(baja),
        solicitudesFinanciacion: solicitudesFinanciacion.map(({ financiera, ...s }) => baja({ ...s, financiera: financiera?.nombre ?? null })),
        postventa: postventa.map(({ tipoRef, ...c }) => baja({ ...c, tipo: tipoRef?.nombre ?? c.tipo })),
        conversaciones: conversaciones.map(baja),
        preguntasMercadoLibre: preguntasMl.map(baja),
        unidadesQueEntrego: ingresosComoVendedor.map(baja),
        pedidosDeDerechos: solicitudesTitular,
    };

    const registros = Object.values(secciones).reduce((n, lista) => n + lista.length, 0);

    return {
        informe: 'Datos personales del titular (art. 14 de la Ley 25.326 de Protección de Datos Personales)',
        generadoEn: ahora,
        responsable: concesionaria,
        nota:
            'Incluye todo lo que la concesionaria guarda de la persona, también lo dado de baja (marcado "dadoDeBaja"). ' +
            'Los adjuntos de las solicitudes de financiación se listan sin el archivo: se entregan aparte si el titular los pide. ' +
            'No incluye datos internos que no son del titular (costos, márgenes, pagos a proveedores, registro de seguridad del sistema).',
        titular,
        ...secciones,
        resumen: { registros },
    };
}
