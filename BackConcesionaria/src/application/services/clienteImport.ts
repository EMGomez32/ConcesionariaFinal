import { OrigenLead } from '@prisma/client';
import prisma from '../../infrastructure/database/prisma';
import { buscarClientePorContacto } from './consultaIngest';
import { normalizarTelefono } from '../../domain/services/telefono';

/**
 * Import masivo de clientes (carga de cartera) — POST /clientes/import.
 *
 * A diferencia de la ingesta de consultas (consultaIngest), acá NO hay
 * round-robin: es una migración de cartera, el vendedor viene (o no) en la fila.
 *
 * Reglas:
 *  - Validación FINA por fila (el Zod del body es laxo a propósito): una fila
 *    mala se reporta en `errores` con su índice 0-based dentro del lote y NO
 *    aborta a las demás. Por eso tampoco hay transacción global.
 *  - Dedupe por teléfono (normalizado) → DNI → email dentro del tenant
 *    (buscarClientePorContacto, el mismo camino que las consultas). Si el
 *    cliente existe:
 *      · actualizarExistentes=true → completar SOLO los campos vacíos/null del
 *        existente (nunca pisar datos cargados) → 'actualizado' si algo cambió,
 *        'salteado' si no había nada para completar.
 *      · actualizarExistentes=false → 'salteado'.
 *  - Los vendedorAsignadoId se validan UNA vez por lote contra prisma.usuario
 *    (la extensión filtra tenant y borrados), no un query por fila.
 *  - concesionariaId lo inyecta la extensión desde el contexto del request.
 */

export interface FilaImport {
    nombre?: string;
    telefono?: string;
    email?: string;
    dni?: string;
    observaciones?: string;
    origenLead?: string;
    vendedorAsignadoId?: number;
}

export interface OpcionesImport {
    estadoInicial: 'contactado' | 'nuevo';
    origenDefault?: string;
    actualizarExistentes: boolean;
}

export interface ErrorFilaImport {
    /** Posición 0-based de la fila DENTRO del lote recibido. */
    indice: number;
    motivo: string;
}

export interface ResultadoImport {
    creados: number;
    actualizados: number;
    salteados: number;
    errores: ErrorFilaImport[];
}

const ORIGENES_VALIDOS = new Set<string>(Object.values(OrigenLead));

// Mismo criterio laxo que el emailOpcional del schema de cliente: alcanza con
// algo@algo.algo — acá se valida a mano (no Zod) para poder reportar por fila.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** '' / espacios / undefined → null; si no, el string trimmeado. */
const limpiar = (v?: string | null): string | null => {
    const t = v?.trim();
    return t ? t : null;
};

export async function importarClientes(filas: FilaImport[], opciones: OpcionesImport): Promise<ResultadoImport> {
    const resultado: ResultadoImport = { creados: 0, actualizados: 0, salteados: 0, errores: [] };

    // Vendedores del lote: un solo query por lote (la extensión acota al tenant
    // y descarta borrados), después cada fila consulta el Set en memoria.
    const idsVendedores = [...new Set(filas.map((f) => f.vendedorAsignadoId).filter((id): id is number => id != null))];
    const vendedoresDelTenant = idsVendedores.length
        ? new Set((await prisma.usuario.findMany({ where: { id: { in: idsVendedores } }, select: { id: true } })).map((u) => u.id))
        : new Set<number>();

    // origenDefault fuera del enum: se ignora (no es un error de fila; la fila no
    // lo trajo). El origenLead de la fila, en cambio, sí se rechaza por fila.
    const origenDefault = opciones.origenDefault && ORIGENES_VALIDOS.has(opciones.origenDefault)
        ? (opciones.origenDefault as OrigenLead)
        : null;

    for (let indice = 0; indice < filas.length; indice++) {
        const fila = filas[indice];
        try {
            const nombre = limpiar(fila.nombre);
            if (!nombre) {
                resultado.errores.push({ indice, motivo: 'Falta el nombre' });
                continue;
            }

            const email = limpiar(fila.email)?.toLowerCase() ?? null;
            if (email && !EMAIL_RE.test(email)) {
                resultado.errores.push({ indice, motivo: 'Email inválido' });
                continue;
            }

            const origenFila = limpiar(fila.origenLead);
            if (origenFila && !ORIGENES_VALIDOS.has(origenFila)) {
                resultado.errores.push({ indice, motivo: 'Canal inválido' });
                continue;
            }

            if (fila.vendedorAsignadoId != null && !vendedoresDelTenant.has(fila.vendedorAsignadoId)) {
                resultado.errores.push({ indice, motivo: 'Vendedor inexistente' });
                continue;
            }

            const telefono = limpiar(fila.telefono);
            const dni = limpiar(fila.dni);
            const observaciones = limpiar(fila.observaciones);
            const origenLead = (origenFila as OrigenLead | null) ?? origenDefault;

            // Dedupe TELÉFONO → DNI → EMAIL: la fila del import sí trae DNI, así
            // que una cartera vieja que se re-importa con los teléfonos escritos
            // de otra forma cae igual sobre la ficha que ya existe.
            const existente = await buscarClientePorContacto({ telefono, dni, email });

            if (existente) {
                if (!opciones.actualizarExistentes) {
                    resultado.salteados++;
                    continue;
                }
                // Completar SOLO lo vacío/null del existente — nunca pisar datos.
                const data: Record<string, unknown> = {};
                // La forma canónica acompaña SIEMPRE al teléfono: si se completa el
                // texto y la columna queda vieja (o en null), el índice del dedupe
                // afirma un número que no es el de este cliente.
                if (!limpiar(existente.telefono) && telefono) {
                    data.telefono = telefono;
                    data.telefonoNormalizado = normalizarTelefono(telefono);
                }
                if (!limpiar(existente.email) && email) data.email = email;
                if (!limpiar(existente.dni) && dni) data.dni = dni;
                if (!limpiar(existente.observaciones) && observaciones) data.observaciones = observaciones;
                if (existente.origenLead == null && origenFila) data.origenLead = origenFila as OrigenLead;
                if (existente.vendedorAsignadoId == null && fila.vendedorAsignadoId != null) {
                    data.vendedorAsignadoId = fila.vendedorAsignadoId;
                    // La fecha va con la asignación: es contra ella que se mide la
                    // retención mientras no haya un contacto real posterior.
                    data.vendedorAsignadoEn = new Date();
                }

                if (Object.keys(data).length === 0) {
                    resultado.salteados++;
                    continue;
                }
                await prisma.cliente.update({ where: { id: existente.id }, data });
                resultado.actualizados++;
                continue;
            }

            await prisma.cliente.create({
                data: {
                    // concesionariaId lo inyecta la extensión desde el contexto.
                    nombre,
                    telefono,
                    telefonoNormalizado: normalizarTelefono(telefono),
                    email,
                    dni,
                    observaciones,
                    origenLead,
                    estadoLead: opciones.estadoInicial,
                    // SIN round-robin: carga de cartera, no consulta entrante.
                    vendedorAsignadoId: fila.vendedorAsignadoId ?? null,
                    // Un import ASIGNA cartera, no registra un contacto: el reloj
                    // de la retención arranca en la fecha de la asignación, no en
                    // una "última interacción" que nunca existió.
                    vendedorAsignadoEn: fila.vendedorAsignadoId != null ? new Date() : null,
                } as never,
            });
            resultado.creados++;
        } catch (err) {
            // Una fila que explota (p. ej. constraint de DB) no voltea el lote.
            const motivo = err instanceof Error ? err.message.split('\n').pop()?.trim() || 'Error inesperado' : 'Error inesperado';
            resultado.errores.push({ indice, motivo: `Error al procesar la fila: ${motivo}` });
        }
    }

    return resultado;
}
