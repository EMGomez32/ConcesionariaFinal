import { IGastoFijoRepository } from '../../../domain/repositories/IGastoFijoRepository';

export class CreateGastoFijo {
    constructor(private readonly repository: IGastoFijoRepository) { }

    async execute(data: any) {
        return this.repository.create(data);
    }
}
