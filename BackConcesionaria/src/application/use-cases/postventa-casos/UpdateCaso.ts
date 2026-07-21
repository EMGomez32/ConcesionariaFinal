import { IPostventaCasoRepository } from '../../../domain/repositories/IPostventaCasoRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';
import { assertValidTransition } from '../../../domain/services/stateMachine';
import { assertTipoUsable } from './CreateCaso';

export class UpdateCaso {
    constructor(private readonly repository: IPostventaCasoRepository) { }

    async execute(id: number, data: any) {
        const exists: any = await this.repository.findById(id);
        if (!exists) throw new NotFoundException('Caso de postventa');

        const patch = { ...data };

        // Reclasificar un caso es válido (se abre sin saber de qué es y después
        // se define), pero el tipo tiene que ser del tenant y estar activo.
        if (patch.tipoId !== undefined && patch.tipoId !== exists.tipoId) {
            await assertTipoUsable(patch.tipoId);
        }

        if (patch.estado && patch.estado !== exists.estado) {
            assertValidTransition('postventa', exists.estado, patch.estado);
            if (patch.estado === 'resuelto' && !exists.fechaCierre && !patch.fechaCierre) {
                patch.fechaCierre = new Date();
            }
        }

        return this.repository.update(id, patch);
    }
}
