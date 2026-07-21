import { ISucursalRepository } from '../../../domain/repositories/ISucursalRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class GetSucursalById {
    constructor(private readonly sucursalRepository: ISucursalRepository) { }

    async execute(id: number) {
        const s = await this.sucursalRepository.findById(id);
        if (!s) {
            throw new NotFoundException('Sucursal');
        }
        return s;
    }
}
