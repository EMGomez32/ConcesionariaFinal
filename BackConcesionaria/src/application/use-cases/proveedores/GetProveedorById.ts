import { IProveedorRepository } from '../../../domain/repositories/IProveedorRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class GetProveedorById {
    constructor(private readonly proveedorRepository: IProveedorRepository) { }

    async execute(id: number) {
        const proveedor = await this.proveedorRepository.findById(id);
        if (!proveedor) {
            throw new NotFoundException('Proveedor');
        }
        return proveedor;
    }
}
