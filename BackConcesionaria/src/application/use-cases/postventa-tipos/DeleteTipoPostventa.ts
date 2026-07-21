import { ITipoPostventaRepository } from '../../../domain/repositories/ITipoPostventaRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';

export class DeleteTipoPostventa {
    constructor(private readonly repository: ITipoPostventaRepository) { }

    async execute(id: number) {
        const existe = await this.repository.findById(id);
        if (!existe) throw new NotFoundException('Tipo de postventa');

        // Un tipo en uso no se borra: los casos que lo referencian quedarían sin
        // tipo (la FK es ON DELETE SET NULL) y se perdería el dato. Para sacarlo
        // de circulación está `activo: false`, que lo deja fuera del alta pero
        // conserva los casos históricos.
        const enUso = await this.repository.countCasos(id);
        if (enUso > 0) {
            throw new BaseException(
                400,
                `No se puede eliminar "${existe.nombre}": lo usan ${enUso} caso(s). Archivalo en vez de borrarlo.`,
                'HAS_RELATIONS',
            );
        }
        return this.repository.delete(id);
    }
}
