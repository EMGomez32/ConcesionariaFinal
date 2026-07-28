import { ICotizacionRepository } from '../../../domain/repositories/ICotizacionRepository';

export class UpsertCotizacion {
    constructor(private readonly repository: ICotizacionRepository) { }

    async execute(data: any) {
        return this.repository.upsertByFecha(data);
    }
}
