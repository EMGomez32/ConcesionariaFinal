import { VehiculoInteres } from '../entities/VehiculoInteres';

export interface IVehiculoInteresRepository {
    /** Vehículos que le interesan a un cliente. */
    findByCliente(clienteId: number): Promise<VehiculoInteres[]>;
    /** Clientes interesados en un vehículo. */
    findByVehiculo(vehiculoId: number): Promise<VehiculoInteres[]>;
    findById(id: number): Promise<VehiculoInteres | null>;
    /**
     * Idempotente: si el cliente ya marcó ese vehículo, actualiza la nota y
     * devuelve el existente. `created` distingue el alta real (201) de la
     * actualización (200) para el status HTTP y la auditoría.
     */
    create(data: any): Promise<{ entity: VehiculoInteres; created: boolean }>;
    delete(id: number): Promise<void>;
}
