import { IVehiculoArchivoRepository } from '../../../domain/repositories/IVehiculoArchivoRepository';
import { NotFoundException, BaseException } from '../../../domain/exceptions/BaseException';

export class SetPrincipalVehiculoArchivo {
    constructor(private readonly repository: IVehiculoArchivoRepository) { }

    async execute(id: number) {
        const exists = await this.repository.findById(id);
        if (!exists) throw new NotFoundException('Archivo');
        // Sólo una FOTO puede ser la principal. Sin este guard, marcar un documento
        // (vía API directa; la UI ya sólo ofrece la estrella en fotos) desmarcaría la
        // foto principal real y dejaría el flag sobre un no-foto: la ficha —que filtra
        // por tipo 'foto'— perdería en silencio la foto elegida y caería al fallback.
        if (exists.tipo !== 'foto') {
            throw new BaseException(400, 'Sólo una foto puede marcarse como principal', 'VALIDATION_ERROR');
        }
        return this.repository.setPrincipal(id);
    }
}
