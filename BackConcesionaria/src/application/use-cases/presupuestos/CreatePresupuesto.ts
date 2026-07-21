import { IPresupuestoRepository } from '../../../domain/repositories/IPresupuestoRepository';
import { BaseException } from '../../../domain/exceptions/BaseException';

export class CreatePresupuesto {
    constructor(private readonly presupuestoRepository: IPresupuestoRepository) { }

    async execute(data: any) {
        if (!data.concesionariaId) {
            throw new BaseException(400, 'concesionariaId es obligatorio', 'VALIDATION_ERROR');
        }

        // HU-55: si el cliente no manda nroPresupuesto, autogenerarlo como
        // PRES-{YYYY}-{NNN} usando el siguiente número del año en esa concesionaria.
        // Hay un riesgo de race condition mínimo (dos creates concurrentes con el
        // mismo número); el @@unique([concesionariaId, nroPresupuesto]) del schema
        // sirve de safety net.
        if (!data.nroPresupuesto) {
            const year = new Date().getFullYear();
            const count = await this.presupuestoRepository.countByYearAndConcesionaria(
                year,
                data.concesionariaId
            );
            const nro = String(count + 1).padStart(3, '0');
            data.nroPresupuesto = `PRES-${year}-${nro}`;
        }

        return this.presupuestoRepository.create(data);
    }
}
