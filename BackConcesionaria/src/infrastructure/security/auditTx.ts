import { AccionAudit, Prisma } from '@prisma/client';
import { context } from './context';

/**
 * AUDITORÍA DENTRO DE LA TRANSACCIÓN de la operación de plata.
 *
 * `audit()` (audit.ts) es fire-and-forget y corre DESPUÉS del commit, en su propia
 * transacción: si el INSERT del rastro falla, la operación ya quedó hecha y el
 * error sólo va al log. Para el grueso de la app es lo correcto (un audit roto no
 * puede tumbar un alta de cliente), pero en las operaciones con las que se tapa un
 * desvío —anular una venta, cancelar un contrato o una seña, cobrar— deja un hueco
 * (PROC-35): la operación sin su rastro. Acá el rastro se escribe con el MISMO `tx`
 * de `withTenantTransaction`, así que commitean juntos o no commitea ninguno.
 *
 * Por qué no se rediseñó `audit()`: lo llaman decenas de controllers sin tx a mano
 * y su contrato ("nunca tira") es justamente lo que esos flujos necesitan. Esta es
 * la variante para los pocos caminos donde el contrato tiene que ser el opuesto.
 *
 * RLS: el INSERT corre bajo las GUC que setea withTenantTransaction (tenant del
 * actor, o is_super_admin para super_admin), y `concesionariaId` es el de la
 * ENTIDAD, no el del actor: un super_admin que anula una venta de otra
 * concesionaria deja el rastro en el audit_log de ESA concesionaria, que es donde
 * su admin lo va a buscar.
 */
export interface AuditEnTxParams {
    concesionariaId: number;
    entidad: string;
    entidadId: number;
    accion: AccionAudit;
    detalle: string;
}

export async function auditEnTx(tx: Prisma.TransactionClient, params: AuditEnTxParams): Promise<void> {
    const user = context.getUser();
    await tx.auditLog.create({
        data: {
            concesionariaId: params.concesionariaId,
            usuarioId: user?.userId ?? null,
            entidad: params.entidad,
            entidadId: params.entidadId,
            accion: params.accion,
            detalle: params.detalle,
            ip: context.getIp() ?? null,
            userAgent: context.getUserAgent() ?? null,
        },
    });
}

/**
 * Detalle de auditoría legible + el cambio en JSON compacto.
 *
 * Primera línea para una persona ("Venta 12 anulada. Motivo: …"), segunda línea con
 * el antes/después que permite reconstruir qué valía cada cosa. La pantalla de
 * auditoría lo muestra en un <pre>, así que el salto de línea se respeta.
 * `JSON.stringify` ya serializa bien Decimal (toJSON → string) y Date (ISO), y
 * descarta las claves `undefined`.
 */
export function detalleConCambio(frase: string, cambio: Record<string, unknown>): string {
    return `${frase}\n${JSON.stringify(cambio)}`;
}
