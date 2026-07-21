import { IProveedorRepository } from '../../../domain/repositories/IProveedorRepository';
import { BaseException } from '../../../domain/exceptions/BaseException';

export class CreateProveedor {
    constructor(private readonly proveedorRepository: IProveedorRepository) { }

    async execute(data: any) {
        if (!data.nombre) {
            throw new BaseException(400, 'El nombre es obligatorio', 'VALIDATION_ERROR');
        }

        // Additional business logic can go here
        return this.proveedorRepository.create(data);
    }
}
