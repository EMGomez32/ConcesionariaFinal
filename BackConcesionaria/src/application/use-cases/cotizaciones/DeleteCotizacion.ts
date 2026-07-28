import { ICotizacionRepository } from '../../../domain/repositories/ICotizacionRepository';

export class DeleteCotizacion {
    constructor(private readonly repository: ICotizacionRepository) { }

    async execute(id: number) {
        return this.repository.delete(id);
    }
}
