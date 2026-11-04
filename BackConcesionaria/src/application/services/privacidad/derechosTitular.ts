import prisma from '../../../infrastructure/database/prisma';
import { withTenantTransaction } from '../../../infrastructure/database/unitOfWork';
import { context } from '../../../infrastructure/security/context';
import { audit } from '../../../infrastructure/security/audit';
import { storage } from '../../../infrastructure/storage/LocalStorageAdapter';
import { logger } from '../../../infrastructure/logging/logger';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import { conFiltroCartera } from '../carteraCliente';
import { armarInformeTitular } from './informeTitular';
import {
    suprimirTitular,
    borrarBinarios,
    ClienteNoEncontradoError,
    ClienteYaSuprimidoError,
    ResultadoSupresion,
} from './supresionTitular';

/**
 * Casos de uso de los derechos del titular (PRIV-05) que corren dentro de un request:
 * el informe de acceso, la supresión, la revocación del consentimiento y el bloqueo.
 * Las rutas son de admin (privacidad.routes.ts); acá se resuelve el tenant, se abre
 * la transacción y se deja el rastro.
 */

export class ClienteSuprimidoError extends BaseException {
    constructor() {
        super(409, 'Los datos de este titular ya se suprimieron: no se pueden volver a suprimir ni modificar su bloqueo.', 'TITULAR_SUPRIMIDO');
    }
}

/**
 * ¿De qué concesionaria es el cliente? Para el admin, SIEMPRE la suya (un id de otro
 * tenant da 404, igual que la ficha). El super_admin no tiene tenant en el contexto:
 * se toma el de la propia ficha, porque las operaciones de abajo filtran por tenant
 * explícito y necesitan uno.
 */
async function tenantDelCliente(clienteId: number): Promise<number> {
    const user = context.getUser();
    const esSuper = user?.roles?.includes('super_admin') ?? false;
    if (!esSuper) {
        if (!user?.concesionariaId) throw new NotFoundException('Cliente');
        return user.concesionariaId;
    }
    // Transacción RAW (no la extensión): la extensión filtraría las fichas dadas de baja,
    // y el informe y la supresión también corren sobre ellas. Para super_admin la
    // transacción marca app.is_super_admin, así que la RLS lo deja leer.
    const fila = await withTenantTransaction((tx) => tx.cliente.findUnique({
        where: { id: clienteId },
        select: { concesionariaId: true },
    }));
    if (!fila) throw new NotFoundException('Cliente');
    return fila.concesionariaId;
}

const traducir = (err: unknown): never => {
    if (err instanceof ClienteNoEncontradoError) throw new NotFoundException('Cliente');
    if (err instanceof ClienteYaSuprimidoError) throw new ClienteSuprimidoError();
    throw err;
};

// ─────────────────────────────────────────────────────────────────────────────
// ACCESO (art. 14)
// ─────────────────────────────────────────────────────────────────────────────

export async function informeDelTitular(clienteId: number) {
    const concesionariaId = await tenantDelCliente(clienteId);
    const informe = await withTenantTransaction(
        (tx) => armarInformeTitular(tx, { concesionariaId, clienteId }),
        { timeout: 30_000 },
    ).catch(traducir);

    await audit({
        entidad: 'Cliente',
        accion: 'export',
        entidadId: clienteId,
        concesionariaId,
        detalle: `Informe de datos del titular (derecho de acceso, art. 14): ${informe.resumen.registros} registro(s) además de la ficha`,
    });
    return informe;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPRESIÓN (art. 16)
// ─────────────────────────────────────────────────────────────────────────────

export interface RespuestaSupresion extends Omit<ResultadoSupresion, 'storageKeys'> {
    adjuntosBorrados: number;
    explicacion: string;
}

function explicar(r: ResultadoSupresion): string {
    if (r.modo === 'total') {
        return 'Se suprimieron todos los datos del titular: la ficha quedó anonimizada y dada de baja, y se borraron sus mensajes, notas y adjuntos.';
    }
    return (
        'La supresión fue PARCIAL porque la ley obliga a conservar parte de los datos: ' +
        `${r.obligaciones.motivos.join('; ')}. ` +
        `Se conservan sólo ${r.conservado.join(', ')}, y quedan BLOQUEADOS: no se usan para contactar ni para nada ` +
        'que no sea cumplir esa obligación. Todo lo demás (mensajes, notas, observaciones, adjuntos) se borró. ' +
        'Respondele al titular explicando qué se conserva y por qué (art. 16 inc. 5 de la Ley 25.326).'
    );
}

export async function suprimirDatosDelTitular(clienteId: number, motivo: string): Promise<RespuestaSupresion> {
    const concesionariaId = await tenantDelCliente(clienteId);
    const resultado = await withTenantTransaction(
        (tx) => suprimirTitular(tx, { concesionariaId, clienteId, motivo }),
        { timeout: 60_000 },
    ).catch(traducir);

    // Los binarios, recién con la transacción confirmada (ver supresionTitular.ts).
    const { borrados, fallidos } = await borrarBinarios(resultado.storageKeys, (k) => storage.delete(k));
    if (fallidos > 0) {
        logger.warn(`[privacidad] supresión del cliente ${clienteId}: ${fallidos} adjunto(s) no se pudieron borrar del disco`);
    }

    await audit({
        entidad: 'Cliente',
        accion: 'suprimir',
        entidadId: clienteId,
        concesionariaId,
        detalle: (
            `Supresión ${resultado.modo} a pedido del titular. Motivo: ${motivo}. ` +
            `Filas: ${Object.entries(resultado.suprimido).map(([k, v]) => `${k}=${v}`).join(', ')}; adjuntos borrados del disco: ${borrados}` +
            (resultado.modo === 'parcial' ? `. Se conserva por obligación legal: ${resultado.obligaciones.motivos.join('; ')}` : '')
        ).slice(0, 2000),
    });

    const { storageKeys: _omit, ...publico } = resultado;
    void _omit;
    return { ...publico, adjuntosBorrados: borrados, explicacion: explicar(resultado) };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSENTIMIENTO Y BLOQUEO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La ficha viva sobre la que se revoca o bloquea. Pasa por el recorte de cartera: un
 * vendedor puro (la revocación también es suya, la recibe en el mostrador) sólo puede
 * tocar clientes que ve; para el admin el filtro no cambia nada.
 */
async function fichaViva(clienteId: number) {
    const concesionariaId = await tenantDelCliente(clienteId);
    const c = await prisma.cliente.findFirst({ where: await conFiltroCartera({ id: clienteId, concesionariaId }) });
    if (!c) throw new NotFoundException('Cliente');
    return c;
}

/**
 * Revocación del consentimiento de contacto (art. 5: es revocable en cualquier momento).
 * Desde acá el cliente sale de la agenda de seguimientos y la atención vuelve a pedirle
 * el consentimiento antes de cualquier interés real. Se conservan la fecha y la versión
 * del otorgamiento original: son la evidencia de que antes sí lo había dado.
 */
export async function revocarConsentimiento(clienteId: number, motivo?: string) {
    const c = await fichaViva(clienteId);
    if (c.suprimidoEn) throw new ClienteSuprimidoError();
    const ahora = new Date();
    const actualizado = await prisma.cliente.update({
        where: { id: clienteId },
        data: { consentimientoContacto: false, consentimientoRevocadoEn: ahora },
    });
    await audit({
        entidad: 'Cliente',
        accion: 'revocar_consentimiento',
        entidadId: clienteId,
        concesionariaId: c.concesionariaId,
        detalle: `El titular revocó el consentimiento de contacto${motivo ? `. Motivo: ${motivo}` : ''}`.slice(0, 1000),
    });
    return actualizado;
}

/** Bloqueo (art. 16): no se lo contacta ni se usan sus datos mientras dure. */
export async function bloquearTitular(clienteId: number, motivo: string) {
    const c = await fichaViva(clienteId);
    if (c.suprimidoEn) throw new ClienteSuprimidoError();
    const actualizado = await prisma.cliente.update({
        where: { id: clienteId },
        data: { bloqueadoEn: c.bloqueadoEn ?? new Date(), bloqueoMotivo: motivo.slice(0, 1000) },
    });
    await audit({
        entidad: 'Cliente',
        accion: 'bloquear',
        entidadId: clienteId,
        concesionariaId: c.concesionariaId,
        detalle: `Datos del titular bloqueados. Motivo: ${motivo}`.slice(0, 1000),
    });
    return actualizado;
}

/**
 * Levantar el bloqueo. Una ficha SUPRIMIDA no se desbloquea nunca: su bloqueo es lo que
 * garantiza que los datos conservados por obligación legal no vuelvan a usarse.
 */
export async function desbloquearTitular(clienteId: number, motivo: string) {
    const c = await fichaViva(clienteId);
    if (c.suprimidoEn) throw new ClienteSuprimidoError();
    const actualizado = await prisma.cliente.update({
        where: { id: clienteId },
        data: { bloqueadoEn: null, bloqueoMotivo: null },
    });
    await audit({
        entidad: 'Cliente',
        accion: 'desbloquear',
        entidadId: clienteId,
        concesionariaId: c.concesionariaId,
        detalle: `Bloqueo levantado. Motivo: ${motivo}`.slice(0, 1000),
    });
    return actualizado;
}
