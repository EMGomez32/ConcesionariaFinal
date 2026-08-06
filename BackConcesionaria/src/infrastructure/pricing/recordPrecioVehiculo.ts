import prisma from '../database/prisma';
import { context } from '../security/context';

/**
 * Registra un cambio de precio de LISTA del vehículo en el historial (log
 * append-only). Best-effort: si el insert falla NO rompe el alta/edición del
 * vehículo (es un registro secundario, no dato de dominio). La extensión RLS
 * inyecta el tenant y envuelve el insert en la transacción con app.tenant_id;
 * para super_admin usa el concesionariaId explícito que se pasa acá.
 */
export async function recordPrecioVehiculo(params: {
    concesionariaId: number;
    vehiculoId: number;
    precioAnterior: number | null;
    precioNuevo: number;
    moneda?: string | null;
    motivo?: string | null;
}): Promise<void> {
    try {
        await prisma.vehiculoPrecioHistorial.create({
            data: {
                concesionariaId: params.concesionariaId,
                vehiculoId: params.vehiculoId,
                precioAnterior: params.precioAnterior,
                precioNuevo: params.precioNuevo,
                moneda: params.moneda === 'USD' ? 'USD' : 'ARS',
                motivo: params.motivo ?? null,
                usuarioId: context.getUser()?.userId ?? null,
            },
        });
    } catch (e) {
        // No propagar: el cambio de precio del vehículo ya se persistió.
        console.error('[precio-historial] no se pudo registrar el cambio de precio de lista', e);
    }
}
