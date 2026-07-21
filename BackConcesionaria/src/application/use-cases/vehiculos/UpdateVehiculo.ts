import { IVehiculoRepository } from '../../../domain/repositories/IVehiculoRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';
import { assertValidTransition } from '../../../domain/services/stateMachine';

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

        // clienteOrigenId es dato del ingreso, no del vehículo: se descarta.
        const { clienteOrigenId, ...vehiculoData } = data;

        // Los inputs type="date" mandan "YYYY-MM-DD" y los selects strings.
        if (vehiculoData.fechaIngreso) vehiculoData.fechaIngreso = new Date(vehiculoData.fechaIngreso);
        if (vehiculoData.fechaCompra) vehiculoData.fechaCompra = new Date(vehiculoData.fechaCompra);
        if (vehiculoData.proveedorCompraId !== undefined) {
            vehiculoData.proveedorCompraId = vehiculoData.proveedorCompraId ? Number(vehiculoData.proveedorCompraId) : null;
        }
        void clienteOrigenId;

        return this.vehiculoRepository.update(id, vehiculoData);
    }
}
