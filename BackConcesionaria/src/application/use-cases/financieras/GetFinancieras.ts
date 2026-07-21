import { IFinancieraRepository } from '../../../domain/repositories/IFinancieraRepository';

export class GetFinancieras {
    constructor(private readonly repository: IFinancieraRepository) { }

    async execute(concesionariaId: number) {
        return this.repository.findAll(concesionariaId);
    }
}
