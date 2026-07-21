import { ISucursalRepository } from '../../../domain/repositories/ISucursalRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';

export class DeleteSucursal {
    constructor(private readonly sucursalRepository: ISucursalRepository) { }

    async execute(id: number) {
        const exists = await this.sucursalRepository.findById(id);
        if (!exists) {
            throw new NotFoundException('Sucursal');
        }

        // El borrado es lógico: si queda algo colgando, el hijo apunta a un padre
        // invisible y el daño es silencioso (no un error). Se listan TODOS los
        // motivos juntos para no hacer descubrir de a uno cuánto falta desvincular.
        const enUso = await this.sucursalRepository.countRelaciones(id);
        if (enUso.length > 0) {
            const detalle = enUso.map((r) => `${r.cantidad} ${r.etiqueta}`).join(', ');
            throw new BaseException(
                400,
                `No se puede eliminar la sucursal porque tiene ${detalle}. Desactivala en vez de borrarla.`,
                'HAS_RELATIONS',
            );
        }

        return this.sucursalRepository.delete(id);
    }
}
