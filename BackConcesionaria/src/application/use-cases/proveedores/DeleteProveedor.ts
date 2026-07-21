import { IProveedorRepository } from '../../../domain/repositories/IProveedorRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';

export class DeleteProveedor {
    constructor(private readonly proveedorRepository: IProveedorRepository) { }

    async execute(id: number) {
        const exists = await this.proveedorRepository.findById(id);
        if (!exists) {
            throw new NotFoundException('Proveedor');
        }

        const gastos = await this.proveedorRepository.countGastos(id);
        if (gastos > 0) {
            throw new BaseException(400, 'No se puede eliminar el proveedor porque tiene gastos asociados', 'HAS_RELATIONS');
        }

        const postventa = await this.proveedorRepository.countPostventaItems(id);
        if (postventa > 0) {
            throw new BaseException(400, 'No se puede eliminar el proveedor porque tiene ítems de postventa asociados', 'HAS_RELATIONS');
        }

        return this.proveedorRepository.delete(id);
    }
}
