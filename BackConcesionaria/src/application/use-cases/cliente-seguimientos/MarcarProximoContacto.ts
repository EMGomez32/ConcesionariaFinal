import { IClienteSeguimientoRepository } from '../../../domain/repositories/IClienteSeguimientoRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

/** Marca (o desmarca) el próximo contacto de un seguimiento como realizado. */
export class MarcarProximoContacto {
    constructor(private readonly repository: IClienteSeguimientoRepository) { }

    async execute(id: number, hecho: boolean) {
        // findById pasa por el RLS de la extensión: si el seguimiento es de otro
        // tenant no existe para este usuario y devuelve 404 (no 403 con leak).
        const exists = await this.repository.findById(id);
        if (!exists) throw new NotFoundException('Seguimiento');
        return this.repository.setProximoHecho(id, hecho);
    }
}
