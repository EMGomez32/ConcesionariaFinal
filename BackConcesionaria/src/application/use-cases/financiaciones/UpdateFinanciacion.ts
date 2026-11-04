import { Prisma } from '@prisma/client';
import { IFinanciacionRepository } from '../../../domain/repositories/IFinanciacionRepository';
import { BaseException, ForbiddenException, NotFoundException } from '../../../domain/exceptions/BaseException';
import { assertValidTransition } from '../../../domain/services/stateMachine';
import { withTenantTransaction } from '../../../infrastructure/database/unitOfWork';
import { context } from '../../../infrastructure/security/context';
import { actorEsAdmin } from '../../../infrastructure/security/roles';
import { auditEnTx, detalleConCambio } from '../../../infrastructure/security/auditTx';

/**
 * PATCH /financiaciones/:id — estado y observaciones del contrato.
 *
 * CANCELAR ES DEL ADMIN, CON MOTIVO (PROC-32). La ruta está abierta a vendedor y
 * cobrador porque marcar mora / volver al día es su trabajo diario, pero pasar a
 * `cancelada` cierra el contrato para siempre (stateMachine no le da salida) y el
 * mismo cobrador que registra los cobros podía, con un PATCH, dar por cancelada
 * una deuda. El rol se chequea también en el middleware de la ruta (antes de
 * validar el body); acá se repite porque el permiso no puede depender de por dónde
 * se entró.
 *
 * `refinanciada` tampoco se fija a mano: sólo la pone RefinanciarFinanciacion al
 * crear el contrato nuevo. Por PATCH quedaba "refinanciada" sin refinanciación,
 * o sea cerrada por otro nombre.
 *
 * La auditoría (estado anterior → nuevo, motivo) va DENTRO de la transacción.
 */
export class UpdateFinanciacion {
    constructor(private readonly repository: IFinanciacionRepository) { }

    async execute(id: number, data: { estado?: string; observaciones?: string; motivo?: string }) {
        const exists: any = await this.repository.findById(id);
        if (!exists) throw new NotFoundException('Financiación');

        if (data.estado === 'refinanciada' && exists.estado !== 'refinanciada') {
            throw new BaseException(
                400,
                'Un plan se refinancia con "Refinanciar" (crea el contrato nuevo por el saldo), no cambiando su estado.',
                'REFINANCIACION_MANUAL',
            );
        }
        if (data.estado === 'cancelada' && exists.estado !== 'cancelada' && !actorEsAdmin()) {
            throw new ForbiddenException('Cancelar un plan es del administrador. Podés marcarlo en mora o al día.');
        }
        if (data.estado && data.estado !== exists.estado) {
            assertValidTransition('financiacion', exists.estado, data.estado);
        }

        const tenantId = exists.concesionariaId;
        const isSuper = context.getUser()?.roles?.includes('super_admin') || false;
        const tenantWhere = isSuper ? {} : { concesionariaId: tenantId };
        const tenantSql = isSuper ? Prisma.empty : Prisma.sql`AND concesionaria_id = ${tenantId}`;

        await withTenantTransaction(async (tx) => {
            // Estado releído BAJO LOCK: la transición se decide con lo que hay ahora (un
            // refinanciar o un cobro concurrente ya pudo cambiarlo), no con la lectura previa.
            const locked = (await tx.$queryRaw<Array<{ estado: string; observaciones: string | null }>>(Prisma.sql`
                SELECT estado, observaciones FROM financiaciones
                WHERE id = ${id} AND deleted_at IS NULL ${tenantSql}
                FOR UPDATE`))[0];
            if (!locked) throw new NotFoundException('Financiación');
            const cambiaEstado = !!data.estado && data.estado !== locked.estado;
            if (cambiaEstado) assertValidTransition('financiacion', locked.estado, data.estado!);

            const cambios: Prisma.FinanciacionUpdateInput = {};
            if (cambiaEstado) cambios.estado = data.estado as any;
            if (data.observaciones !== undefined) cambios.observaciones = data.observaciones;
            if (Object.keys(cambios).length === 0) return;

            await tx.financiacion.update({ where: { id, ...tenantWhere, deletedAt: null }, data: cambios });

            const cancela = cambiaEstado && data.estado === 'cancelada';
            await auditEnTx(tx, {
                concesionariaId: tenantId,
                entidad: 'Financiacion',
                entidadId: id,
                accion: cancela ? 'cancel' : 'update',
                detalle: detalleConCambio(
                    cancela
                        ? `Financiación ${id} cancelada. Motivo: ${data.motivo}`
                        : cambiaEstado
                            ? `Financiación ${id}: estado ${locked.estado} → ${data.estado}`
                            : `Financiación ${id}: observaciones actualizadas`,
                    {
                        ...(cancela ? { motivo: data.motivo } : {}),
                        antes: {
                            estado: locked.estado,
                            ...(data.observaciones !== undefined ? { observaciones: locked.observaciones } : {}),
                        },
                        despues: {
                            estado: cambiaEstado ? data.estado : locked.estado,
                            ...(data.observaciones !== undefined ? { observaciones: data.observaciones } : {}),
                        },
                    },
                ),
            });
        });

        // Misma forma de respuesta que antes (detalle con cuotas, venta y cliente).
        return this.repository.findById(id);
    }
}
