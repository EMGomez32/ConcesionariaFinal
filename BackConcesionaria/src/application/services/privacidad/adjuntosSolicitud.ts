import prisma from '../../../infrastructure/database/prisma';
import { storage } from '../../../infrastructure/storage/LocalStorageAdapter';
import { audit } from '../../../infrastructure/security/audit';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Borrado REAL de los adjuntos de una solicitud de financiación (DNI, recibos de sueldo).
 *
 * Dar de baja una solicitud es lógico (deletedAt), pero sus adjuntos no tienen por qué
 * sobrevivirla: son la parte más sensible del legajo (foto del documento, ingresos y, en
 * el recibo, a veces afiliación sindical u obra social) y, con la solicitud dada de baja,
 * ya no sirven para nada (PRIV-02). Antes quedaban en disco y seguían saliendo firmados.
 *
 * Mismo criterio que el borrado de un adjunto suelto (SolicitudFinanciacionController
 * .deleteArchivo): primero el binario (best-effort: si ya no está, no es error) y después
 * la fila — si la fila no se pudiera borrar, queda apuntando a un archivo inexistente,
 * que es inocuo; al revés quedaría un DNI en disco sin nada que lo encuentre.
 *
 * Usa la extensión: corre dentro del request, con el tenant ya inyectado.
 */
export async function borrarAdjuntosDeSolicitud(solicitudId: number): Promise<number> {
    const archivos = await prisma.solicitudFinanciacionArchivo.findMany({
        where: { solicitudId },
        select: { id: true, storageKey: true },
    });
    if (archivos.length === 0) return 0;

    let fallidos = 0;
    for (const a of archivos) {
        if (!a.storageKey) continue;
        try {
            await storage.delete(a.storageKey);
        } catch {
            fallidos++;
        }
    }
    if (fallidos > 0) {
        logger.warn(`[privacidad] solicitud ${solicitudId}: ${fallidos} adjunto(s) no se pudieron borrar del disco`);
    }

    const { count } = await prisma.solicitudFinanciacionArchivo.deleteMany({
        where: { id: { in: archivos.map((a) => a.id) } },
    });

    await audit({
        entidad: 'SolicitudFinanciacionArchivo',
        accion: 'delete',
        detalle: `${count} adjunto(s) borrados (archivo y registro) al dar de baja la solicitud ${solicitudId}`,
    });
    return count;
}
