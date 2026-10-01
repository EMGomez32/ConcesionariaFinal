import { env } from '../../config/env';

/**
 * Roles que DEBEN tener 2FA activado.
 *
 *  - MFA_REQUIRED_ROLES con valor manda: "super_admin,admin", "super_admin". El valor "none" no exige a nadie.
 *  - Sin definir O VACÍA (docker compose pasa las variables sin definir como cadena vacía): en producción se exige a super_admin (la cuenta que administra todas las
 *    concesionarias de la plataforma); en desarrollo y test no se exige a nadie, para no trabar el
 *    login de los usuarios demo ni la suite de integración.
 *
 * "Exigir" significa: quien tiene ese rol y todavía no activó el 2FA puede entrar, pero su sesión
 * queda en `mfaPending` y la API sólo le deja configurarlo hasta que lo haga (ver authenticate).
 * Escape de emergencia: MFA_REQUIRED_ROLES=none en el .env y reiniciar.
 */
export function rolesQueExigenMfa(): string[] {
    const crudo = (process.env.MFA_REQUIRED_ROLES ?? '').trim();
    if (crudo.toLowerCase() === 'none') return [];
    if (crudo !== '') {
        return crudo.split(',').map((r) => r.trim()).filter(Boolean);
    }
    return env.NODE_ENV === 'production' ? ['super_admin'] : [];
}

export const exigeMfa = (roles: string[] | undefined): boolean => {
    const exigidos = rolesQueExigenMfa();
    return (roles ?? []).some((r) => exigidos.includes(r));
};

/** ¿La sesión de este usuario debe quedar restringida a configurar el 2FA? */
export const mfaPendiente = (roles: string[] | undefined, totpEnabled: boolean): boolean =>
    exigeMfa(roles) && !totpEnabled;
