/**
 * Texto de auditoría para altas y cambios de usuarios. Antes un cambio de roles
 * quedaba como "Usuario X actualizado", sin decir QUÉ cambió: no se podía saber si
 * alguien fue promovido a admin. Acá se arma el detalle con el antes/después.
 */

/** Nombres de los roles vigentes del usuario, ordenados. */
export function nombresDeRoles(u: any): string[] {
    const roles: any[] = Array.isArray(u?.roles) ? u.roles : [];
    return roles
        .filter((r) => !r?.deletedAt && !r?.rol?.deletedAt)
        .map((r) => String(r?.rol?.nombre ?? r?.nombre ?? ''))
        .filter(Boolean)
        .sort();
}

const lista = (roles: string[]) => `[${roles.join(', ') || 'sin roles'}]`;

/** "Roles: [a] → [a, b]" sólo si cambiaron; marca cuando se otorga super_admin. */
export function detalleCambioDeRoles(antes: string[], despues: string[]): string | null {
    if (antes.join('|') === despues.join('|')) return null;
    const otorgaSuper = despues.includes('super_admin') && !antes.includes('super_admin');
    return `Roles: ${lista(antes)} → ${lista(despues)}${otorgaSuper ? ' — SE OTORGÓ super_admin' : ''}`;
}

/** Detalle completo de un update: nombre + cambios de roles / estado / email. */
export function detalleUpdate(
    etiqueta: string,
    antes: any,
    despues: any,
): string {
    const cambios: string[] = [];
    const roles = detalleCambioDeRoles(nombresDeRoles(antes), nombresDeRoles(despues));
    if (roles) cambios.push(roles);
    if (antes && despues && antes.activo !== undefined && antes.activo !== despues.activo) {
        cambios.push(`Estado: ${antes.activo ? 'activo' : 'inactivo'} → ${despues.activo ? 'activo' : 'inactivo'}`);
    }
    if (antes && despues && antes.email && despues.email && antes.email !== despues.email) {
        cambios.push('Email modificado');
    }
    return cambios.length ? `Usuario ${etiqueta} actualizado. ${cambios.join('. ')}` : `Usuario ${etiqueta} actualizado`;
}
