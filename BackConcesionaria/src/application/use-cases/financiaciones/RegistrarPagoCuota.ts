import { Prisma } from '@prisma/client';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import { withTenantTransaction } from '../../../infrastructure/database/unitOfWork';
import { evaluarPagoCuota } from '../../../domain/services/pagoCuota';
import { context } from '../../../infrastructure/security/context';

export class RegistrarPagoCuota {
    async execute(cuotaId: number, data: { monto: number; metodo: string; fechaPago?: string; idempotencyKey?: string }) {
        // Aislamiento de tenant en la capa APP (NO depender sólo de la RLS: la app
        // se conecta como superusuario de Postgres, que saltea RLS). Es el mismo
        // filtro que la extensión inyecta y que este camino raw debe replicar.
        // super_admin no se filtra: opera sobre cualquier concesionaria.
        const isSuper = context.getUser()?.roles?.includes('super_admin') || false;
        const tenantId = context.getTenantId();
        if (!isSuper && !tenantId) {
            throw new BaseException(401, 'Sesión sin concesionaria', 'UNAUTHORIZED');
        }
        const tenantSql = isSuper ? Prisma.empty : Prisma.sql`AND concesionaria_id = ${tenantId}`;
        const tenantWhere = isSuper ? {} : { concesionariaId: tenantId };

        // Todo el cobro en UNA transacción atómica con las vars de RLS seteadas una
        // sola vez (Unit of Work): el decremento del saldo y el registro del pago
        // commitean juntos o no commitean. Cierra la atomicidad cross-op, el
        // lost-update por concurrencia y la idempotencia de reenvíos.
        return withTenantTransaction(async (tx) => {
            // 1) Lock de la fila de la cuota, ACOTADO al tenant. Serializa cobros
            //    concurrentes de la MISMA cuota (el segundo espera al commit del
            //    primero) y una cuota de otro tenant no aparece → 404.
            const rows = await tx.$queryRaw<Array<{
                estado: string;
                saldo_cuota: string;
                fecha_pago_completo: Date | null;
            }>>(Prisma.sql`
                SELECT estado, saldo_cuota, fecha_pago_completo
                FROM cuotas
                WHERE id = ${cuotaId} AND deleted_at IS NULL ${tenantSql}
                FOR UPDATE`);
            const locked = rows[0];
            if (!locked) throw new NotFoundException('Cuota');

            // 2) Idempotencia — DESPUÉS del lock y acotada a ESTA cuota: si otro
            //    request con la misma clave ya registró el pago de esta cuota
            //    (reenvío/retry, ahora serializado), devolvemos el estado actual sin
            //    volver a cobrar.
            if (data.idempotencyKey) {
                const yaRegistrado = await tx.pagoCuota.findFirst({
                    where: { cuotaId, idempotencyKey: data.idempotencyKey, ...tenantWhere },
                    select: { id: true },
                });
                if (yaRegistrado) {
                    return tx.cuota.findUnique({ where: { id: cuotaId } });
                }
            }

            // 3) Validación de negocio (pura) sobre el saldo REAL bajo lock.
            const ev = evaluarPagoCuota({
                estado: locked.estado,
                saldoCuota: Number(locked.saldo_cuota),
                monto: data.monto,
            });
            if (!ev.ok) throw new BaseException(ev.status, ev.message, ev.code);

            // 4) Actualiza la cuota (saldo/estado derivados del saldo lockeado) y
            //    registra el pago, en la MISMA tx.
            await tx.cuota.update({
                where: { id: cuotaId, ...tenantWhere },
                data: {
                    saldoCuota: ev.nuevoSaldo,
                    estado: ev.nuevoEstado as any,
                    ...(ev.saldada && !locked.fecha_pago_completo ? { fechaPagoCompleto: new Date() } : {}),
                },
            });

            try {
                await tx.pagoCuota.create({
                    data: {
                        cuotaId,
                        monto: ev.monto,
                        metodo: data.metodo as any,
                        fechaPago: data.fechaPago ? new Date(data.fechaPago) : new Date(),
                        // Seteo explícito del tenant (no confiar en el trigger/RLS).
                        ...(isSuper ? {} : { concesionariaId: tenantId }),
                        ...(data.idempotencyKey ? { idempotencyKey: data.idempotencyKey } : {}),
                    },
                });
            } catch (e: any) {
                // Backstop: si por una carrera llegó a colar dos inserts con la misma
                // clave, el unique lo rebota (P2002). El throw revierte TODA la tx
                // (incluido el decremento) → nunca hay doble cobro.
                if (data.idempotencyKey && e?.code === 'P2002') {
                    throw new BaseException(409, 'El pago ya fue registrado (reenvío); recargá para ver el estado', 'PAGO_DUPLICADO');
                }
                throw e;
            }

            return tx.cuota.findUnique({ where: { id: cuotaId } });
        });
    }
}
