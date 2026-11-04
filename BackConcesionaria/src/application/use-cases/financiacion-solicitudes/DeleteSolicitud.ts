import { ISolicitudFinanciacionRepository } from '../../../domain/repositories/ISolicitudFinanciacionRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';
import { borrarAdjuntosDeSolicitud } from '../../services/privacidad/adjuntosSolicitud';

export class DeleteSolicitud {
    constructor(
        private readonly repository: ISolicitudFinanciacionRepository,
        // Inyectable para poder probar el caso de uso sin disco ni base.
        private readonly borrarAdjuntos: (solicitudId: number) => Promise<number> = borrarAdjuntosDeSolicitud,
    ) { }

    async execute(id: number) {
        const exists = await this.repository.findById(id);
        if (!exists) throw new NotFoundException('Solicitud de financiación');
        const result = await this.repository.delete(id);
        // La baja de la solicitud es lógica; la de sus adjuntos (DNI, recibos), REAL.
        // Va después de la baja: si la baja fallara, los adjuntos siguen sirviendo.
        await this.borrarAdjuntos(id);
        return result;
    }
}
