import { IConcesionariaRepository } from '../../../domain/repositories/IConcesionariaRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';

export class DeleteConcesionaria {
    constructor(private readonly concesionariaRepository: IConcesionariaRepository) { }

    async execute(id: number) {
        const exists = await this.concesionariaRepository.findById(id);
        if (!exists) throw new NotFoundException('Concesionaria');

        const sucursales = await this.concesionariaRepository.countActiveSucursales(id);
        if (sucursales > 0) {
            throw new BaseException(400, 'No se puede eliminar la concesionaria porque tiene sucursales activas', 'HAS_RELATIONS');
        }

        const usuarios = await this.concesionariaRepository.countActiveUsuarios(id);
        if (usuarios > 0) {
            throw new BaseException(400, 'No se puede eliminar la concesionaria porque tiene usuarios activos', 'HAS_RELATIONS');
        }

        const vehiculos = await this.concesionariaRepository.countActiveVehiculos(id);
        if (vehiculos > 0) {
            throw new BaseException(400, 'No se puede eliminar la concesionaria porque tiene vehículos activos', 'HAS_RELATIONS');
        }

        return this.concesionariaRepository.delete(id);
    }
}
