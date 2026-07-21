import { IReservaRepository } from '../../../domain/repositories/IReservaRepository';
import { IVehiculoRepository } from '../../../domain/repositories/IVehiculoRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import prisma from '../../../infrastructure/database/prisma';
import { context } from '../../../infrastructure/security/context';

export class CreateReserva {
    constructor(
        private readonly reservaRepository: IReservaRepository,
        private readonly vehiculoRepository: IVehiculoRepository
    ) { }

    async execute(data: any) {
        const { vehiculoId } = data;
        const vehiculo = await this.vehiculoRepository.findById(vehiculoId);
        if (!vehiculo) throw new NotFoundException('Vehículo');
        if (vehiculo.estado === 'reservado' || vehiculo.estado === 'vendido') {
            throw new BaseException(400, 'El vehículo no está disponible para reserva', 'VEHICULO_NOT_AVAILABLE');
        }

        const user = context.getUser();

        return prisma.$transaction(async (tx) => {
            // El frontend manda monto/moneda/fechaVencimiento/vendedorId; se
            // traducen a las columnas reales (montoSenia/venceEl/creadaPorId).
            const reserva = await tx.reserva.create({
                data: {
                    concesionariaId: vehiculo.concesionariaId,
                    sucursalId: Number(data.sucursalId),
                    vehiculoId,
                    clienteId: Number(data.clienteId),
                    creadaPorId: data.vendedorId ? Number(data.vendedorId) : (user?.userId ?? null),
                    estado: 'activa',
                    fecha: new Date(),
                    venceEl: data.fechaVencimiento ? new Date(data.fechaVencimiento) : null,
                    montoSenia: data.monto !== undefined && data.monto !== null && data.monto !== '' ? Number(data.monto) : null,
                    moneda: data.moneda || 'ARS',
                    observaciones: data.observaciones || null,
                }
            });

            await tx.vehiculo.update({
                where: { id: vehiculoId },
                data: { estado: 'reservado' }
            });

            await tx.vehiculoMovimiento.create({
                data: {
                    concesionariaId: vehiculo.concesionariaId,
                    vehiculoId,
                    tipo: 'asignacion_reserva',
                    motivo: `Reserva #${reserva.id} creada`,
                    registradoPorId: user?.userId ?? null,
                },
            });

            return reserva;
        });
    }
}
