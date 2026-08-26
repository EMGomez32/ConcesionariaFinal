import { context } from './context';

/**
 * Helpers de rol para los casos que `authorize(...)` NO puede resolver.
 *
 * `authorize` es un middleware: decide por método + path, antes de mirar el body.
 * Alcanza para "esta ruta es de admin". No alcanza cuando la potestad depende de
 * QUÉ se está pidiendo — un campo del body que sólo el admin puede fijar, o un
 * estado destino que es una anulación disfrazada de transición. Para esos dos
 * casos el chequeo va en la capa interface (controller), que es donde vive el
 * concepto de rol, y usa esto.
 *
 * REGLA: si podés resolverlo con `authorize(...)` en la ruta, resolvelo ahí. Esto
 * es para lo que no entra en un middleware, no un atajo para saltearlo.
 */

/** El rol de mayor privilegio del tenant, más el bypass de plataforma. */
export function actorEsAdmin(): boolean {
    const roles = context.getUser()?.roles ?? [];
    return roles.includes('admin') || roles.includes('super_admin');
}

/** La cuenta de plataforma. No es un puesto de la concesionaria. */
export function actorEsSuperAdmin(): boolean {
    return (context.getUser()?.roles ?? []).includes('super_admin');
}

/** ¿El actor tiene alguno de estos roles? `super_admin` pasa siempre, igual que en `authorize`. */
export function actorTieneRol(...roles: string[]): boolean {
    const propios = context.getUser()?.roles ?? [];
    return propios.includes('super_admin') || roles.some(r => propios.includes(r));
}

/**
 * Vendedor "puro": tiene el rol vendedor y NINGUNO de los que ven todo el tenant.
 *
 * Es el sujeto del criterio de aceptación 7 ("el vendedor no accede a costos ni
 * márgenes por ninguna vía") y del recorte de cartera: un admin que además tenga
 * el rol vendedor sigue viendo todo, porque su potestad no viene del rol vendedor.
 *
 * Misma definición que `esVendedorPuro()` de conversacionService y que el
 * `esSoloVendedor` de ReporteController; vive acá para que los tres recortes
 * (bandeja, reportes, cartera) no puedan divergir.
 */
export function actorEsVendedorPuro(): boolean {
    const roles = context.getUser()?.roles ?? [];
    return roles.includes('vendedor') && !roles.includes('admin') && !roles.includes('super_admin');
}

/** Id del usuario logueado (0 si no hay contexto: nunca matchea una FK real). */
export function actorUserId(): number {
    return context.getUser()?.userId ?? 0;
}
