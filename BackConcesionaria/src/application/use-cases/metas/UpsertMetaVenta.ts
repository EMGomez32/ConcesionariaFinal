import { IMetaVentaRepository } from '../../../domain/repositories/IMetaVentaRepository';

export class UpsertMetaVenta {
    constructor(private readonly repository: IMetaVentaRepository) { }

    async execute(data: any) {
        return this.repository.upsertByPeriodo(data);
    }
}
