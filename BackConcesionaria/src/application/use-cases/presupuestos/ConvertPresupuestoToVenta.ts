import { IPresupuestoRepository } from '../../../domain/repositories/IPresupuestoRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import { CreateVenta } from '../ventas/CreateVenta';

export class ConvertPresupuestoToVenta {
    constructor(
        private readonly presupuestoRepository: IPresupuestoRepository,
        private readonly createVentaUC: CreateVenta
    ) { }

    async execute(presupuestoId: number, body: any) {
        const presupuesto: any = await this.presupuestoRepository.findById(presupuestoId);
        if (!presupuesto) throw new NotFoundException('Presupuesto');

        if (presupuesto.estado !== 'aceptado') {
            throw new BaseException(
                422,
                `El presupuesto debe estar en estado 'aceptado' para convertirse en venta (actual: '${presupuesto.estado}')`,
                'INVALID_STATE'
            );
        }

        const primerItem = presupuesto.items?.[0];
        if (!primerItem) {
            throw new BaseException(400, 'El presupuesto no tiene ítems', 'VALIDATION_ERROR');
        }

        const ventaData = {
            sucursalId: body.sucursalId ?? presupuesto.sucursalId,
            clienteId: presupuesto.clienteId,
            vendedorId: body.vendedorId ?? presupuesto.vendedorId,
            vehiculoId: primerItem.vehiculoId,
            presupuestoId: presupuesto.id,
            precioVenta: body.precioVenta ?? primerItem.precioFinal ?? primerItem.precioLista,
            moneda: body.moneda ?? presupuesto.moneda ?? 'ARS',
            formaPago: body.formaPago ?? 'contado',
            fechaVenta: body.fechaVenta ?? new Date().toISOString(),
            observaciones: body.observaciones,
            pagos: body.pagos,
            externos: body.externos,
            canjes: body.canjes,
        };

        return this.createVentaUC.execute(ventaData);
    }
}
