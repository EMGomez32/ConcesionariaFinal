import { IObjetivoVendedorRepository } from '../../../domain/repositories/IObjetivoVendedorRepository';

export class DeleteObjetivoVendedor {
    constructor(private readonly repository: IObjetivoVendedorRepository) { }

    async execute(id: number) {
        return this.repository.delete(id);
    }
}
