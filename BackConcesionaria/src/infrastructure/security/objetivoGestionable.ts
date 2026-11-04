import { context } from './context';
import { BaseException } from '../../domain/exceptions/BaseException';

/**
 * Vive aparte de usuarioPolicy.ts a propósito: no toca la base (sólo mira el objetivo ya
 * cargado y el actor del contexto), así que los casos de uso que lo usan no arrastran
 * prisma → env al importarse y siguen siendo testeables sin stack.
 */

const actorEsSuperAdmin = (): boolean =>
    context.getUser()?.roles?.includes('super_admin') ?? false;

/** Nombres de los roles vigentes de un usuario cargado con `roles: { include: { rol: true } }`. */
function rolesVigentes(u: any): string[] {
    const roles: any[] = Array.isArray(u?.roles) ? u.roles : [];
    return roles
        .filter((r) => !r?.deletedAt && !r?.rol?.deletedAt)
        .map((r) => String(r?.rol?.nombre ?? r?.nombre ?? ''))
        .filter(Boolean);
}

/**
 * Rechaza (403) si un actor que NO es super_admin intenta modificar, resetear la
 * contraseña o el 2FA, desactivar o borrar a un usuario que TIENE el rol super_admin.
 *
 * assertRolesAsignables impide OTORGAR super_admin, pero no protegía a la cuenta que ya
 * lo tiene: un admin de tenant con un super_admin visible (asociado a su concesionaria)
 * podía cambiarle el email y pedir el reset, resetearle la contraseña, quitarle el rol o
 * borrarlo. Y la cuenta de plataforma saltea el aislamiento entre concesionarias. Sólo
 * otro super_admin la administra (mismo criterio que ya tenía el reset del 2FA).
 */
export function assertObjetivoGestionable(objetivo: unknown): void {
    if (actorEsSuperAdmin()) return;
    if (rolesVigentes(objetivo).includes('super_admin')) {
        throw new BaseException(
            403,
            'Sólo un super_admin puede modificar la cuenta de otro super_admin.',
            'TARGET_NOT_MANAGEABLE',
        );
    }
}
