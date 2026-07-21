import { IProveedorRepository } from '../../../domain/repositories/IProveedorRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class UpdateProveedor {
    constructor(private readonly proveedorRepository: IProveedorRepository) { }

    async execute(id: number, data: any) {
        const exists = await this.proveedorRepository.findById(id);
        if (!exists) {
            throw new NotFoundException('Proveedor');
        }
        return this.proveedorRepository.update(id, data);
    }
}
