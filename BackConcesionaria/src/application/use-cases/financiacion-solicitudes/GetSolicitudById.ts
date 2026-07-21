import { ISolicitudFinanciacionRepository } from '../../../domain/repositories/ISolicitudFinanciacionRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class GetSolicitudById {
    constructor(private readonly repository: ISolicitudFinanciacionRepository) { }

    async execute(id: number) {
        const s = await this.repository.findById(id);
        if (!s) throw new NotFoundException('Solicitud de financiación');
        return s;
    }
}
