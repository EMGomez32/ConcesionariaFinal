import prisma from '../database/prisma';
import { context } from './context';
import { BaseException } from '../../domain/exceptions/BaseException';

/**
 * Políticas de negocio del alta/edición de usuarios que NO son responsabilidad
 * de la validación de forma (Zod) sino del actor y del estado del tenant:
 *
 *  - assertRolesAsignables: impide la escalada de privilegios. El schema Zod sólo
 *    valida que roleIds sean enteros positivos; no sabe QUÉ roles son ni QUIÉN los
 *    pide. Sin este candado, un admin de tenant podía mandar en el body el rolId
 *    del rol global `super_admin` (lo trae GET /roles, y el modelo Rol es global)
 *    y auto-promoverse o crear un super_admin, rompiendo TODO el aislamiento
 *    multi-tenant (super_admin saltea la inyección de concesionariaId de la RLS).
 *
 *  - assertLimiteUsuarios: hace cumplir el cupo de usuarios por concesionaria que
 *    fija el super_admin (columna Concesionaria.limiteUsuarios). El candado real
 *    vive acá (server-side); el front sólo lo refleja como UX.
 *
 * Ambas se saltean para super_admin: puede asignar cualquier rol y crear sin
 * tope (es quien administra la plataforma y quien fija los límites).
 */

// Roles que un actor NO super_admin puede asignar. `super_admin` queda FUERA a
// propósito: sólo un super_admin puede otorgarlo. Un rolId que no resuelva a
// ninguno de estos (incluido un id inexistente o el de super_admin) se rechaza.
const ROLES_ASIGNABLES_NO_SUPER = ['admin', 'vendedor', 'cobrador', 'postventa', 'lectura', 'tasador'];

const actorEsSuperAdmin = (): boolean =>
    context.getUser()?.roles?.includes('super_admin') ?? false;

/**
 * Rechaza (403) si el actor no-super intenta asignar un rol que no le está
 * permitido. Resuelve los NOMBRES de rol de los ids pedidos (el rol se persiste
 * por id numérico, pero la política se razona por nombre) contra la tabla Rol,
 * que es un modelo global sin RLS.
 */
export async function assertRolesAsignables(roleIds: unknown): Promise<void> {
    if (!Array.isArray(roleIds) || roleIds.length === 0) return;
    if (actorEsSuperAdmin()) return;

    const ids = Array.from(
        new Set(
            roleIds
                .map((r) => Number(r))
                .filter((n) => Number.isInteger(n) && n > 0),
        ),
    );
    if (ids.length === 0) return;

    const roles = await prisma.rol.findMany({
        where: { id: { in: ids } },
        select: { id: true, nombre: true },
    });
    const nombrePorId = new Map<number, string>(roles.map((r: any) => [r.id, r.nombre]));

    for (const id of ids) {
        const nombre = nombrePorId.get(id);
        // id inexistente, o rol fuera de la allow-list (p.ej. super_admin) → 403.
        if (!nombre || !ROLES_ASIGNABLES_NO_SUPER.includes(nombre)) {
            throw new BaseException(
                403,
                'No tenés permiso para asignar ese rol',
                'ROLE_NOT_ALLOWED',
            );
        }
    }
}

/** Nombres de rol de una lista de ids (la tabla Rol es global, sin RLS). */
export async function nombresDeRoles(roleIds: unknown): Promise<string[]> {
    if (!Array.isArray(roleIds) || roleIds.length === 0) return [];
    const ids = Array.from(new Set(roleIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)));
    if (ids.length === 0) return [];
    const roles = await prisma.rol.findMany({ where: { id: { in: ids } }, select: { nombre: true } });
    return roles.map((r: any) => String(r.nombre));
}

/**
 * APP-02: una cuenta super_admin es de la PLATAFORMA, no de una concesionaria.
 *
 * Con concesionaria quedaba "colgada" de un tenant: aparecía en el listado de
 * usuarios de ese tenant, la resolución de tenant por defecto (resolveConcesionariaId)
 * la usaba como si fuera un usuario más y el admin del tenant la tenía a la vista
 * como objetivo (assertObjetivoGestionable lo frena, pero es la segunda red). El
 * candado duro está en la base (trigger de la migración super_admin_sin_concesionaria);
 * esto lo adelanta con un 400 entendible en vez de un error de base.
 */
export function assertSuperAdminSinConcesionaria(nombresDeRol: string[], concesionariaId: unknown): void {
    if (!nombresDeRol.includes('super_admin')) return;
    if (concesionariaId === null || concesionariaId === undefined) return;
    throw new BaseException(
        400,
        'Una cuenta super_admin es de la plataforma y no puede pertenecer a una concesionaria. Asignale otro rol o quitale la concesionaria.',
        'SUPER_ADMIN_CON_CONCESIONARIA',
    );
}

/**
 * Rechaza (409) si crear un usuario más superaría el cupo de la concesionaria.
 * Sólo aplica a actores no-super y cuando la concesionaria tiene un límite
 * configurado (null = ilimitado). Cuenta usuarios ACTIVOS (no soft-deleted).
 *
 * LIMITACIÓN CONOCIDA (TOCTOU): el count y el INSERT posterior (en CreateUsuario)
 * no son atómicos, así que dos altas concurrentes del mismo tenant pueden ambas
 * pasar el chequeo y exceder el cupo en 1-2. El impacto es acotado (sobrecupo de
 * una cuota de negocio, sin cruce de tenant ni escalada) y explotarlo exige un
 * admin disparando requests en paralelo a propósito. La garantía dura (constraint
 * o contador atómico en DB, o un Unit of Work serializable) queda para el trabajo
 * de atomicidad transaccional del roadmap (no se fuerza acá una tx que colisione
 * con la mini-transacción por-operación de la extensión RLS).
 */
export async function assertLimiteUsuarios(concesionariaId: unknown): Promise<void> {
    if (actorEsSuperAdmin()) return;
    const cid = Number(concesionariaId);
    if (!Number.isInteger(cid) || cid <= 0) return;

    const conc: any = await prisma.concesionaria.findUnique({
        where: { id: cid },
        select: { limiteUsuarios: true },
    });
    const limite = conc?.limiteUsuarios;
    if (limite == null) return; // sin tope configurado

    const actuales = await prisma.usuario.count({
        where: { concesionariaId: cid, deletedAt: null },
    });
    if (actuales >= limite) {
        throw new BaseException(
            409,
            `La concesionaria alcanzó su límite de ${limite} usuario${limite === 1 ? '' : 's'}. Pedile a la administración de la plataforma que lo amplíe.`,
            'USER_LIMIT_REACHED',
        );
    }
}
