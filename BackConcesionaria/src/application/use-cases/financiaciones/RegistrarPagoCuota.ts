import { IFinanciacionRepository } from '../../../domain/repositories/IFinanciacionRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';
import prisma from '../../../infrastructure/database/prisma';

export class RegistrarPagoCuota {
    constructor(private readonly repository: IFinanciacionRepository) { }

    async execute(cuotaId: number, data: { monto: number; metodo: string; fechaPago?: string }) {
        // Chequeo de tenant ANTES de la transacción: los reads dentro de una
        // $transaction interactiva no pasan por la extensión (no setea las vars de
        // RLS), así que `tx.cuota.findUnique` traería cuotas de cualquier tenant.
        // Este lookup top-level SÍ pasa por la extensión, que para un admin filtra
        // por su concesionaria → una cuota ajena da 404 en vez de dejarse pagar.
        const cuotaDelTenant = await prisma.cuota.findUnique({ where: { id: cuotaId } });
        if (!cuotaDelTenant) throw new NotFoundException('Cuota');

        return prisma.$transaction(async (tx) => {
            const cuota = await tx.cuota.findUnique({ where: { id: cuotaId } });
            if (!cuota) throw new NotFoundException('Cuota');

            const saldoRestante = Number(cuota.saldoCuota) - Number(data.monto);
            const cuotaSaldada = saldoRestante <= 0;
            const nuevoEstado = cuotaSaldada ? 'pagada' : 'parcial';

            await tx.pagoCuota.create({
                data: {
                    cuotaId,
                    monto: data.monto,
                    metodo: data.metodo as any,
                    fechaPago: data.fechaPago ? new Date(data.fechaPago) : new Date()
                }
            });

            const updateData: any = {
                estado: nuevoEstado as any,
                saldoCuota: Math.max(0, saldoRestante),
            };
            if (cuotaSaldada && !cuota.fechaPagoCompleto) {
                updateData.fechaPagoCompleto = new Date();
            }

            return tx.cuota.update({
                where: { id: cuotaId },
                data: updateData,
            });
        });
    }
}
