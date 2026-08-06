import { IVehiculoInteresRepository } from '../../../domain/repositories/IVehiculoInteresRepository';

export class GetInteresByCliente {
    constructor(private readonly repository: IVehiculoInteresRepository) { }

    async execute(clienteId: number) {
        return this.repository.findByCliente(clienteId);
    }
}
