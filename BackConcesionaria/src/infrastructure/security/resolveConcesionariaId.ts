import { context } from './context';

/**
 * Resuelve a qué concesionaria pertenece un recurso tenant-scoped que se está
 * creando, a partir del actor del request y del valor que vino por body:
 *   - super_admin: la que eligió por body (puede crear para cualquier tenant).
 *   - resto: siempre la suya (del token); se ignora el body → sin fuga cross-tenant.
 *
 * Por qué hace falta: la extensión RLS de Prisma inyecta `concesionariaId` en el
 * create SÓLO para el NO super_admin (prisma.extension.ts). El super_admin no está
 * atado a un tenant, así que sin resolverlo acá su create llega sin concesionaria y
 * Prisma tira "Argument `concesionaria` is missing" (500). El repo lo setea explícito
 * con este valor, fuera de su whitelist/pickEditable.
 *
 * Patrón de referencia: SucursalController.create + UsuarioController.create.
 */
export function resolveConcesionariaId(bodyConcesionariaId: unknown): number | null {
    const actor = context.getUser();
    const isSuper = actor?.roles?.includes('super_admin');
    if (isSuper) {
        if (bodyConcesionariaId == null) return null;
        // Un `Number()` a secas dejaba salir NaN (?concesionariaId=abc) y 0
        // (?concesionariaId=), y NINGUNO de los dos es null: el guard
        // `concesionariaId == null` de cada controller los dejaba pasar y el
        // valor llegaba hasta Prisma. Ahí terminaba en un 500 opaco o —peor— en
        // una consulta apuntada a la concesionaria 0, que no existe y devuelve
        // un "no está activo" que miente sobre el tenant de verdad. Las rutas
        // que validan el body con Zod (optionalFk) ya lo cortaban; las que leen
        // la QUERY cruda, no. Devolver null acá les da a todas el mismo 400
        // "elegí una concesionaria" en vez de un error que no dice nada.
        const id = Number(bodyConcesionariaId);
        return Number.isInteger(id) && id > 0 ? id : null;
    }
    return actor?.concesionariaId ?? null;
}
