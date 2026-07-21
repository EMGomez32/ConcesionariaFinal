import { IVehiculoMovimientoRepository } from '../../../domain/repositories/IVehiculoMovimientoRepository';
import { context } from '../../../infrastructure/security/context';

export class CreateMovimiento {
    constructor(private readonly repository: IVehiculoMovimientoRepository) { }

    async execute(data: any) {
        // Registrar quién hace el movimiento (el frontend no lo manda).
        return this.repository.create({
            ...data,
            registradoPorId: context.getUser()?.userId ?? null,
        });
    }
}
