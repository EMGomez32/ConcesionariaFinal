import { ClienteSeguimiento } from '../entities/ClienteSeguimiento';

export interface IClienteSeguimientoRepository {
    /** Bitácora de un cliente, más reciente primero. */
    findByCliente(clienteId: number): Promise<ClienteSeguimiento[]>;
    findById(id: number): Promise<ClienteSeguimiento | null>;
    create(data: any): Promise<ClienteSeguimiento>;
    delete(id: number): Promise<void>;
    /** Marca (o desmarca) el próximo contacto como realizado. */
    setProximoHecho(id: number, hecho: boolean): Promise<ClienteSeguimiento>;
}
