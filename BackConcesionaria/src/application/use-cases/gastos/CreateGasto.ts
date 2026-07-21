import { IGastoRepository } from '../../../domain/repositories/IGastoRepository';

export class CreateGasto {
    constructor(private readonly gastoRepository: IGastoRepository) { }

    async execute(data: any) {
        return this.gastoRepository.create(data);
    }
}
