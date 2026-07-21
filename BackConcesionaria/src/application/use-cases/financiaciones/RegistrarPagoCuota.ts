import { IFinanciacionRepository } from '../../../domain/repositories/IFinanciacionRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';
import prisma from '../../../infrastructure/database/prisma';

export class RegistrarPagoCuota {
    constructor(private readonly repository: IFinanciacionRepository) { }

    async execute(cuotaId: number, data: { monto: number; metodo: string; fechaPago?: string }) {
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
