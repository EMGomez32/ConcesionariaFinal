import { IClienteSeguimientoRepository } from '../../../domain/repositories/IClienteSeguimientoRepository';

export class GetSeguimientosByCliente {
    constructor(private readonly repository: IClienteSeguimientoRepository) { }

    async execute(clienteId: number) {
        return this.repository.findByCliente(clienteId);
    }
}
