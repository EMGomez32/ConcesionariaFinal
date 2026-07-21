import { IFinanciacionRepository } from '../../../domain/repositories/IFinanciacionRepository';

export class CreateFinanciacion {
    constructor(private readonly repository: IFinanciacionRepository) { }

    async execute(data: any) {
        return this.repository.create(data);
    }
}
