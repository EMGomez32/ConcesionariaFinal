import { IFinancieraRepository } from '../../../domain/repositories/IFinancieraRepository';

export class CreateFinanciera {
    constructor(private readonly repository: IFinancieraRepository) { }

    async execute(data: any) {
        return this.repository.create(data);
    }
}
