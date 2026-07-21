import { ITipoPostventaRepository } from '../../../domain/repositories/ITipoPostventaRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';

export class UpdateTipoPostventa {
    constructor(private readonly repository: ITipoPostventaRepository) { }

    async execute(id: number, data: any) {
        const existe = await this.repository.findById(id);
        if (!existe) throw new NotFoundException('Tipo de postventa');

        // Renombrar es la razón de ser del catálogo (arreglar "mecanica" a
        // "Mecánica" arrastra a todos los casos), pero no puede pisar a otro.
        if (data?.nombre !== undefined) {
            const otro = await this.repository.findByNombre(data.nombre);
            if (otro && otro.id !== id) {
                throw new BaseException(
                    409,
                    `Ya existe un tipo llamado "${otro.nombre}"`,
                    'DUPLICADO',
                );
            }
        }

        return this.repository.update(id, data);
    }
}
