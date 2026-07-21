import { ISucursalRepository } from '../../../domain/repositories/ISucursalRepository';
import { BaseException } from '../../../domain/exceptions/BaseException';

export class CreateSucursal {
    constructor(private readonly sucursalRepository: ISucursalRepository) { }

    async execute(data: any) {
        if (!data.nombre) {
            throw new BaseException(400, 'El nombre es obligatorio', 'VALIDATION_ERROR');
        }
        // Toda sucursal pertenece a una concesionaria. El controller la resuelve
        // (tenant del token para admin, o la elegida por super_admin); si un
        // super_admin no eligió ninguna, avisamos claro en vez de tirar 500.
        if (!data.concesionariaId) {
            throw new BaseException(400, 'Elegí la concesionaria para la sucursal', 'VALIDATION_ERROR');
        }
        return this.sucursalRepository.create(data);
    }
}
