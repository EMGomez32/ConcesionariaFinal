import { PrismaClient } from '@prisma/client';
import { context } from '../security/context';

// Models that store tenant-scoped data. The extension:
//   - filters reads by `deletedAt: null`
//   - rewrites `delete`/`deleteMany` as soft updates of `deletedAt`
//   - injects `concesionariaId` on create/where for non super_admin
//   - wraps every operation in a transaction that sets `app.tenant_id`
//     and `app.is_super_admin`, so Postgres RLS policies see the right
//     context for the row.
//
// OJO — el filtro de borrados sólo se aplica al `where` de PRIMER NIVEL (ver más
// abajo la lista de operaciones). NO alcanza a las relaciones de un `include`:
// `include: { items: true }` devuelve TAMBIÉN los items borrados. Cada include
// hacia un modelo de esta lista que sea una LISTA (items[], cuotas[]) o un
// componente 1-1 propio (el canje de un presupuesto) tiene que llevar su propio
// `where: { deletedAt: null }` — Prisma lo acepta en ambos casos. Ya pasó: en
// refinanciar, una cuota borrada contaba como impaga e inflaba el capital del
// contrato nuevo.
// No se automatiza porque el DMMF de Prisma en runtime viene recortado (sólo
// name/kind/type/relationName): no expone `isList` ni `relationFromFields`, así
// que no hay forma de distinguir una lista (hay que filtrarla) de una referencia
// como `cliente` (NO hay que filtrarla: una venta vieja debe seguir mostrando su
// cliente aunque lo hayan dado de baja).
const SOFT_DELETE_MODELS = [
    'Concesionaria',
    'Sucursal',
    'Usuario',
    'Cliente',
    'Proveedor',
    'Vehiculo',
    'VehiculoArchivo',
    'IngresoVehiculo',
    'VehiculoMovimiento',
    'Reserva',
    'Presupuesto',
    'PresupuestoItem',
    'PresupuestoExtra',
    // Decía 'PresupuestoCanjeVehiculo', un modelo que no existe (se copió el
    // nombre de VentaCanjeVehiculo, que sí). Como la lista se compara por
    // nombre, la entrada no matcheaba nada y PresupuestoCanje se borraba
    // físicamente pese a tener columna `deleted_at`. Al corregirlo, el include
    // `canje` de PrismaPresupuestoRepository necesita su propio filtro de
    // borrados: `valorTomado` se resta del total del presupuesto.
    'PresupuestoCanje',
    'Venta',
    'VentaPago',
    'VentaExtra',
    'VentaCanjeVehiculo',
    'Financiacion',
    'Cuota',
    'PagoCuota',
    'GastoVehiculo',
    'CategoriaGastoVehiculo',
    'GastoFijo',
    'CategoriaGastoFijo',
    'Financiera',
    'SolicitudFinanciacion',
    'PostventaCaso',
    'PostventaItem',
    'TipoPostventa',
];

// Models without `concesionaria_id`. They skip RLS wrapping AND tenant
// injection. AuditLog has `concesionaria_id` but we treat it as tenant-scoped
// (RLS applies). The other globals (Rol, Plan, RefreshToken, Concesionaria
// itself) skip RLS.
const GLOBAL_MODELS = ['Concesionaria', 'Rol', 'Plan', 'RefreshToken'];

const isSoftDeleteModel = (model: string) =>
    SOFT_DELETE_MODELS.some((m) => m.toLowerCase() === model.toLowerCase());

const isGlobalModel = (model: string) =>
    GLOBAL_MODELS.some((m) => m.toLowerCase() === model.toLowerCase());

const accessor = (model: string) =>
    model.charAt(0).toLowerCase() + model.slice(1);

export const extendedPrisma = (prisma: PrismaClient) => {
    return prisma.$extends({
        query: {
            $allModels: {
                async $allOperations({ model, operation, args, query }) {
                    const tenantId = context.getTenantId();
                    const userContext = context.getUser();
                    const castArgs = args as any;
                    const isSuperAdmin = userContext?.roles?.includes('super_admin') || false;
                    const tenantScoped = !isGlobalModel(model);

                    // Soft-delete read filter
                    if (isSoftDeleteModel(model)) {
                        if (['findFirst', 'findMany', 'findUnique', 'findUniqueOrThrow', 'count', 'aggregate', 'groupBy'].includes(operation)) {
                            castArgs.where = castArgs.where || {};
                            if (castArgs.where.deletedAt === undefined) {
                                castArgs.where.deletedAt = null;
                            }
                        }
                    }

                    // Tenant injection (skip for super_admin and global models)
                    if (tenantId && tenantScoped && !isSuperAdmin) {
                        if (['findFirst', 'findMany', 'findUnique', 'findUniqueOrThrow', 'count', 'aggregate', 'groupBy'].includes(operation)) {
                            castArgs.where = { ...castArgs.where, concesionariaId: tenantId };
                        }
                        if (operation === 'create') {
                            castArgs.data = { ...castArgs.data, concesionariaId: tenantId };
                        }
                        if (['update', 'updateMany', 'delete', 'deleteMany', 'upsert'].includes(operation)) {
                            castArgs.where = { ...castArgs.where, concesionariaId: tenantId };
                            if (operation === 'upsert') {
                                castArgs.create = { ...castArgs.create, concesionariaId: tenantId };
                            }
                        }
                    }

                    // Soft-delete intercept: rewrite delete/deleteMany as updates of deletedAt.
                    let effectiveOp: string = operation;
                    if (isSoftDeleteModel(model)) {
                        if (operation === 'delete') {
                            effectiveOp = 'update';
                            castArgs.data = { deletedAt: new Date() };
                        } else if (operation === 'deleteMany') {
                            effectiveOp = 'updateMany';
                            castArgs.data = { deletedAt: new Date() };
                        }
                    }

                    // Tenant-scoped: wrap in a transaction that sets the RLS
                    // session vars. Uses the raw `prisma` (closure) so the
                    // inner call doesn't re-enter this extension.
                    if (tenantScoped) {
                        return prisma.$transaction(async (tx) => {
                            await tx.$executeRawUnsafe(
                                `SELECT set_config('app.tenant_id', $1, true)`,
                                tenantId ? String(tenantId) : ''
                            );
                            await tx.$executeRawUnsafe(
                                `SELECT set_config('app.is_super_admin', $1, true)`,
                                isSuperAdmin ? 'true' : 'false'
                            );
                            return (tx as any)[accessor(model)][effectiveOp](castArgs);
                        });
                    }

                    // Global model — no RLS, but honor the soft-delete rewrite.
                    if (effectiveOp !== operation) {
                        return (prisma as any)[accessor(model)][effectiveOp](castArgs);
                    }
                    return query(castArgs);
                },
            },
        },
    });
};
