import { IMetaVentaRepository } from '../../../domain/repositories/IMetaVentaRepository';

export class GetMetaVenta {
    constructor(private readonly repository: IMetaVentaRepository) { }

    async execute(anio: number, mes: number, concesionariaId?: number) {
        return this.repository.findByPeriodo(anio, mes, concesionariaId);
    }
}
