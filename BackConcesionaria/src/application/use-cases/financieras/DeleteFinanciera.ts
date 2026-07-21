import { IFinancieraRepository } from '../../../domain/repositories/IFinancieraRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';

export class DeleteFinanciera {
    constructor(private readonly repository: IFinancieraRepository) { }

    async execute(id: number) {
        const exists = await this.repository.findById(id);
        if (!exists) throw new NotFoundException('Financiera');

        const hasSolicitudes = await this.repository.countSolicitudes(id);
        if (hasSolicitudes > 0) {
            throw new BaseException(400, 'No se puede eliminar la financiera porque tiene solicitudes asociadas', 'HAS_RELATIONS');
        }
        return this.repository.delete(id);
    }
}
