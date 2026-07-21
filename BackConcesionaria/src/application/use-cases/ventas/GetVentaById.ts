import { IVentaRepository } from '../../../domain/repositories/IVentaRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class GetVentaById {
    constructor(private readonly ventaRepository: IVentaRepository) { }

    async execute(id: number) {
        const v = await this.ventaRepository.findById(id);
        if (!v) {
            throw new NotFoundException('Venta');
        }
        return v;
    }
}
