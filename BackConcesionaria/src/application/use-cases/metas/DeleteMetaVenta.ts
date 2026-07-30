import { IMetaVentaRepository } from '../../../domain/repositories/IMetaVentaRepository';

export class DeleteMetaVenta {
    constructor(private readonly repository: IMetaVentaRepository) { }

    async execute(id: number) {
        return this.repository.delete(id);
    }
}
