import { Prisma } from '@prisma/client';
import { rawPrisma } from './prisma';
import { context } from '../security/context';

/**
 * Unit of Work: ejecuta `fn` dentro de UNA sola transacción real (cliente RAW, sin
 * la extensión) con las variables de sesión de RLS seteadas una única vez.
 *
 * Por qué existe: la extensión de Prisma (prisma.extension.ts) envuelve CADA
 * operación tenant-scoped en su PROPIA sub-transacción para setear
 * `app.tenant_id`/`app.is_super_admin`. Eso hace que un `prisma.$transaction` del
 * caller NO sea atómico de verdad (create y update de un mismo flujo commitean por
 * separado). Para operaciones multi-statement que mueven dinero (registrar un pago,
 * crear una venta) hace falta una transacción única y atómica: este helper la
 * provee replicando el MISMO contrato de RLS que la extensión, pero una sola vez.
 *
 * OJO: las operaciones sobre `tx` NO pasan por la extensión, así que el CALLER es
 * responsable del aislamiento y del soft-delete:
 *   - NO auto-filtran `deletedAt: null` → agregalo a mano en los where que lo
 *     necesiten.
 *   - NO inyectan `concesionariaId`. Y NO alcanza con confiar en la RLS: la app se
 *     conecta como superusuario de Postgres, que SALTEA row level security (FORCE
 *     sólo somete al dueño de la tabla, no a un superusuario). Por eso el caller
 *     DEBE filtrar por tenant explícitamente en cada where/create (para no-super),
 *     igual que hace la extensión. Las GUC que setea este helper son defensa en
 *     profundidad (recién efectivas el día que la app use un rol NO superusuario).
 *
 * Setea las GUC con el mismo contrato que la extensión (tenant del context o ''
 * para super_admin + flag is_super_admin), para que el aislamiento por RLS quede
 * listo cuando se degrade el rol de conexión.
 */
export function withTenantTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { timeout?: number; maxWait?: number },
): Promise<T> {
    const tenantId = context.getTenantId();
    const isSuperAdmin = context.getUser()?.roles?.includes('super_admin') || false;

    return rawPrisma.$transaction(async (tx) => {
        // Transaction-local (tercer arg `true`): valen sólo dentro de esta tx.
        await tx.$executeRawUnsafe(
            `SELECT set_config('app.tenant_id', $1, true)`,
            tenantId ? String(tenantId) : '',
        );
        await tx.$executeRawUnsafe(
            `SELECT set_config('app.is_super_admin', $1, true)`,
            isSuperAdmin ? 'true' : 'false',
        );
        return fn(tx);
    }, options);
}
