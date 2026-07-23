import { IPresupuestoRepository } from '../../../domain/repositories/IPresupuestoRepository';
import { BaseException } from '../../../domain/exceptions/BaseException';
import { assertMismoTenant } from '../../../infrastructure/security/tenantGuard';

export class CreatePresupuesto {
    constructor(private readonly presupuestoRepository: IPresupuestoRepository) { }

    async execute(data: any) {
        if (!data.concesionariaId) {
            throw new BaseException(400, 'concesionariaId es obligatorio', 'VALIDATION_ERROR');
        }

        // El tenant del presupuesto es el que inyecta el controller desde el token
        // (data.concesionariaId). Todas las FKs del body — sucursal, cliente, el
        // vehículo de cada ítem y el vehículo generado del canje — tienen que ser
        // de ese tenant: una ajena da 404 para el admin y rechazo para super_admin.
        const tenantId = data.concesionariaId;
        await assertMismoTenant('sucursal', data.sucursalId, tenantId);
        await assertMismoTenant('cliente', data.clienteId, tenantId);
        for (const item of Array.isArray(data.items) ? data.items : []) {
            await assertMismoTenant('vehiculo', item?.vehiculoId, tenantId);
        }
        const canje = data.canjes ?? data.canje;
        if (canje) {
            await assertMismoTenant('vehiculo', canje.vehiculoGeneradoId, tenantId);
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
