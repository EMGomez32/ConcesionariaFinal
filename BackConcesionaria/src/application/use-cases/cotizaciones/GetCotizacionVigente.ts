import { ICotizacionRepository } from '../../../domain/repositories/ICotizacionRepository';

export class GetCotizacionVigente {
    constructor(private readonly repository: ICotizacionRepository) { }

    /** La cotización vigente a una fecha (o la última cargada si no se pasa). */
    async execute(fecha?: Date, concesionariaId?: number) {
        return this.repository.findVigente(fecha, concesionariaId);
    }
}
