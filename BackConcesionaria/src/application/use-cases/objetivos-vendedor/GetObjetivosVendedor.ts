import { IObjetivoVendedorRepository } from '../../../domain/repositories/IObjetivoVendedorRepository';

export class GetObjetivosVendedor {
    constructor(private readonly repository: IObjetivoVendedorRepository) { }

    async execute(anio: number, mes: number, concesionariaId?: number) {
        return this.repository.findByPeriodo(anio, mes, concesionariaId);
    }
}
