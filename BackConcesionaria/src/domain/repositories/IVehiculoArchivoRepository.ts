import { VehiculoArchivo } from '../entities/VehiculoArchivo';

export interface IVehiculoArchivoRepository {
    findByVehiculo(vehiculoId: number): Promise<VehiculoArchivo[]>;
    findById(id: number): Promise<VehiculoArchivo | null>;
    create(data: any): Promise<VehiculoArchivo>;
    /** Marca este archivo como la foto principal del vehículo (desmarca los hermanos). */
    setPrincipal(id: number): Promise<VehiculoArchivo>;
    delete(id: number): Promise<void>;
}
