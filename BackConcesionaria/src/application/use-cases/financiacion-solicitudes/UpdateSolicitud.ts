import { ISolicitudFinanciacionRepository } from '../../../domain/repositories/ISolicitudFinanciacionRepository';
import { NotFoundException, BaseException } from '../../../domain/exceptions/BaseException';
import { assertValidTransition } from '../../../domain/services/stateMachine';
import { assertVehiculoDelTenant } from './CreateSolicitud';
import { assertMismoTenant } from '../../../infrastructure/security/tenantGuard';

export class UpdateSolicitud {
    constructor(private readonly repository: ISolicitudFinanciacionRepository) { }

    async execute(id: number, data: any) {
        const exists: any = await this.repository.findById(id);
        if (!exists) throw new NotFoundException('Solicitud de financiación');

        const patch = { ...data };

        // El vehículo se puede corregir mientras la solicitud es un borrador. Una
        // vez enviada, el legajo ya está en el banco con esa unidad: cambiarla
        // acá dejaría al sistema diciendo algo distinto de lo que se presentó.
        if (patch.vehiculoId !== undefined && patch.vehiculoId !== exists.vehiculoId) {
            if (exists.estado !== 'borrador') {
                throw new BaseException(
                    422,
                    'No se puede cambiar el vehículo de una solicitud ya enviada. Cancelala y creá una nueva.',
                    'INVALID_STATE'
                );
            }
            await assertVehiculoDelTenant(patch.vehiculoId);
        }

        // El repo permite reasignar sucursal/venta/presupuesto en el update:
        // confinarlas al tenant de la solicitud.
        const tenantId = exists.concesionariaId;
        await assertMismoTenant('sucursal', patch.sucursalId, tenantId);
        await assertMismoTenant('venta', patch.ventaId, tenantId);
        await assertMismoTenant('presupuesto', patch.presupuestoId, tenantId);

        if (patch.estado && patch.estado !== exists.estado) {
            assertValidTransition('solicitudFinanciacion', exists.estado, patch.estado);

            // Auto-fill timestamps according to the destination state.
            const now = new Date();
            if (patch.estado === 'enviada' && !patch.fechaEnvio && !exists.fechaEnvio) {
                patch.fechaEnvio = now;
            }
            if ((patch.estado === 'aprobada' || patch.estado === 'rechazada') && !patch.fechaRespuesta) {
                patch.fechaRespuesta = now;
            }
        }

        return this.repository.update(id, patch);
    }
}
