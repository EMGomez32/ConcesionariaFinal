import { ITipoPostventaRepository } from '../../../domain/repositories/ITipoPostventaRepository';
import { BaseException } from '../../../domain/exceptions/BaseException';

export class CreateTipoPostventa {
    constructor(private readonly repository: ITipoPostventaRepository) { }

    async execute(data: any) {
        // El @@unique del schema es sensible a mayúsculas, así que dejaría pasar
        // "Mecánica" junto a "mecánica" — justo lo que este catálogo viene a
        // evitar. El chequeo insensible va acá, y además da un mensaje claro en
        // vez de un 500 por violación de constraint.
        const existe = await this.repository.findByNombre(data?.nombre ?? '');
        if (existe) {
            throw new BaseException(
                409,
                `Ya existe un tipo llamado "${existe.nombre}"`,
                'DUPLICADO',
            );
        }
        return this.repository.create(data);
    }
}
