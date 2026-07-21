import { IReservaRepository } from '../../../domain/repositories/IReservaRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class GetReservaById {
    constructor(private readonly reservaRepository: IReservaRepository) { }

    async execute(id: number) {
        const r = await this.reservaRepository.findById(id);
        if (!r) throw new NotFoundException('Reserva');
        return r;
    }
}
