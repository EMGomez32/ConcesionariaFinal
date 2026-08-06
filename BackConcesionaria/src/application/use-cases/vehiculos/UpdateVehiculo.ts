import { IVehiculoRepository } from '../../../domain/repositories/IVehiculoRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';
import { assertValidTransition } from '../../../domain/services/stateMachine';
import { assertMismoTenant } from '../../../infrastructure/security/tenantGuard';
import { recordPrecioVehiculo } from '../../../infrastructure/pricing/recordPrecioVehiculo';

export class UpdateVehiculo {
    constructor(private readonly vehiculoRepository: IVehiculoRepository) { }

    async execute(id: number, data: any) {
        const exists: any = await this.vehiculoRepository.findById(id);
        if (!exists) {
            throw new NotFoundException('Vehículo');
        }

        if (data.estado && data.estado !== exists.estado) {
            assertValidTransition('vehiculo', exists.estado, data.estado);
        }

        // El body de update llega crudo (vehiculo.validation es express-validator y
        // no strippea claves): sucursalId/proveedorCompraId son sobreescribibles y
        // hay que confinarlos al tenant del vehículo.
        const tenantId = exists.concesionariaId;
        await assertMismoTenant('sucursal', data.sucursalId, tenantId);
        await assertMismoTenant('proveedor', data.proveedorCompraId, tenantId);

        // clienteOrigenId es dato del ingreso, no del vehículo: se descarta.
        const { clienteOrigenId, ...vehiculoData } = data;

        // Los inputs type="date" mandan "YYYY-MM-DD" y los selects strings.
        if (vehiculoData.fechaIngreso) vehiculoData.fechaIngreso = new Date(vehiculoData.fechaIngreso);
        if (vehiculoData.fechaCompra) vehiculoData.fechaCompra = new Date(vehiculoData.fechaCompra);
        // Fechas opcionales: presente (incluido '') ⇒ coerce, '' ⇒ null (borra la fecha
        // sin reventar Prisma); ausente ⇒ no se toca (un PATCH parcial no la borra).
        if (vehiculoData.vencimientoVtv !== undefined) {
            vehiculoData.vencimientoVtv = vehiculoData.vencimientoVtv ? new Date(vehiculoData.vencimientoVtv) : null;
        }
        if (vehiculoData.vencimientoSeguro !== undefined) {
            vehiculoData.vencimientoSeguro = vehiculoData.vencimientoSeguro ? new Date(vehiculoData.vencimientoSeguro) : null;
        }
        if (vehiculoData.proveedorCompraId !== undefined) {
            vehiculoData.proveedorCompraId = vehiculoData.proveedorCompraId ? Number(vehiculoData.proveedorCompraId) : null;
        }
        void clienteOrigenId;

        const updated: any = await this.vehiculoRepository.update(id, vehiculoData);

        // Si cambió el precio de lista, lo registramos en el historial (log
        // append-only, best-effort). Sólo cuando el body trae precioLista con un
        // valor numérico distinto al actual: un PATCH que no lo toca no registra
        // nada, y limpiarlo a null tampoco es "un precio nuevo".
        if (vehiculoData.precioLista !== undefined) {
            const anterior = exists.precioLista == null ? null : Number(exists.precioLista);
            const nuevo =
                vehiculoData.precioLista === '' || vehiculoData.precioLista === null
                    ? null
                    : Number(vehiculoData.precioLista);
            if (nuevo != null && !Number.isNaN(nuevo) && nuevo !== anterior) {
                await recordPrecioVehiculo({
                    concesionariaId: exists.concesionariaId,
                    vehiculoId: id,
                    precioAnterior: anterior,
                    precioNuevo: nuevo,
                    moneda: updated?.moneda ?? exists.moneda,
                });
            }
        }

        return updated;
    }
}
