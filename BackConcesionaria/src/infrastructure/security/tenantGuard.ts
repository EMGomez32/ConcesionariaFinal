import prisma from '../database/prisma';
import { context } from './context';
import { BaseException, NotFoundException } from '../../domain/exceptions/BaseException';

/**
 * Guard de integridad cross-tenant para las FKs que llegan en el body.
 *
 * La política RLS `tenant_iso` (prisma/init-rls.ts) sólo valida el
 * `concesionaria_id` de la FILA que se escribe, NO que las FKs de esa fila
 * (sucursalId, clienteId, vehiculoId, ventaId, ...) apunten a filas del mismo
 * tenant. Sin este chequeo, un admin puede armar un POST/PATCH a mano con el id
 * de un recurso ajeno y dejar la fila apuntando a otra concesionaria.
 *
 * El patrón de referencia es TransferVehiculo.ts: se hace el lookup con el
 * cliente Prisma extendido y se compara el concesionariaId contra el tenant
 * destino. Este módulo lo centraliza para no repetir el bloque en cada use case.
 */

// Modelos que pueden llegar como FK en un body. El accessor es el nombre camelCase
// del modelo Prisma; el label es el texto del 404/400 hacia el usuario.
const MODEL_LABELS = {
    sucursal: 'Sucursal',
    cliente: 'Cliente',
    vehiculo: 'Vehículo',
    venta: 'Venta',
    reserva: 'Reserva',
    proveedor: 'Proveedor',
    categoriaGastoVehiculo: 'Categoría de gasto',
    categoriaGastoFijo: 'Categoría de gasto fijo',
    financiera: 'Financiera',
    presupuesto: 'Presupuesto',
    postventaCaso: 'Caso de postventa',
} as const;

export type TenantScopedModel = keyof typeof MODEL_LABELS;

const isSuperAdmin = (): boolean =>
    context.getUser()?.roles?.includes('super_admin') ?? false;

/**
 * Confirma que la fila `model#id` es del tenant destino y devuelve la fila.
 *
 * - Para un admin común, el cliente Prisma extendido ya inyecta su
 *   concesionariaId en el `where`, así que una fila de otro tenant devuelve null
 *   y esto tira 404 (idéntico a "no existe"). Ese es el candado real contra un
 *   POST/PATCH armado a mano.
 * - Para super_admin la extensión NO filtra por tenant: el lookup traería la
 *   fila ajena. Por eso, cuando se conoce el tenant destino, se compara el
 *   concesionariaId explícito y se rechaza el cruce.
 *
 * `expectedTenantId` es el tenant al que va a quedar atada la fila que se está
 * escribiendo: el del padre (p.ej. una venta hereda el del vehículo) o el del
 * token. Si es null/undefined sólo corre el chequeo de existencia (que ya cubre
 * al admin). `id` vacío/0/null se ignora (la FK es opcional): la validación de
 * forma es responsabilidad de la capa de validación, no de este guard.
 *
 * Devuelve la fila encontrada (o null si no había id), para poder derivar de ahí
 * el tenant de los chequeos siguientes sin re-consultar.
 */
export async function assertMismoTenant(
    model: TenantScopedModel,
    id: unknown,
    expectedTenantId?: number | null,
): Promise<any | null> {
    if (id === undefined || id === null || id === '') return null;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) return null;

    const label = MODEL_LABELS[model];
    const row: any = await (prisma as any)[model].findUnique({ where: { id: numId } });
    if (!row) throw new NotFoundException(label);

    if (
        expectedTenantId !== undefined &&
        expectedTenantId !== null &&
        row.concesionariaId !== expectedTenantId
    ) {
        throw new BaseException(400, `${label} pertenece a otra concesionaria`, 'CROSS_TENANT');
    }

    return row;
}

/**
 * Tenant destino de una escritura cuando NO se deriva de un padre.
 *
 * Para super_admin sale del body (puede crear en cualquier concesionaria); para
 * el resto sale del token, que es lo que la extensión RLS termina forzando en la
 * fila. Se usa como `expectedTenantId` en los `assertMismoTenant` de esa escritura.
 */
export function resolveTenantDestino(bodyConcesionariaId?: unknown): number | null {
    if (isSuperAdmin()) {
        return bodyConcesionariaId != null && bodyConcesionariaId !== ''
            ? Number(bodyConcesionariaId)
            : null;
    }
    return context.getTenantId() ?? null;
}
