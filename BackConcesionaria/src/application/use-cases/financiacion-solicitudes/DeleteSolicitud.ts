import { ISolicitudFinanciacionRepository } from '../../../domain/repositories/ISolicitudFinanciacionRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class DeleteSolicitud {
    constructor(private readonly repository: ISolicitudFinanciacionRepository) { }

    async execute(id: number) {
        const exists = await this.repository.findById(id);
        if (!exists) throw new NotFoundException('Solicitud de financiación');
        return this.repository.delete(id);
    }
}
