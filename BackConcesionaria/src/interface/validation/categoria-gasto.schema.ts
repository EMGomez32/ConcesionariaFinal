import { z } from 'zod';

// Schema de validación de categorías de gasto vehicular (CategoriaGastoVehiculo).
// Payload verificado contra el DTO real del front (gastos-categorias.api.ts):
//   create: { nombre: string; descripcion?: string }
//   update: { nombre?: string; descripcion?: string }
//
// El controller resuelve el tenant (body para super_admin, token para el resto).
// La extensión RLS inyecta `concesionariaId` para el NO super_admin, pero NO para
// super_admin, así que ese campo tiene que SOBREVIVIR al strip de Zod para que el
// super_admin pueda elegir concesionaria por body (mismo criterio que
// usuario.schema.ts). Zod descarta cualquier otra clave no declarada (anti
// mass-assignment); esto reemplaza el whitelist manual que hoy hace el repositorio.
//
// `activo` se modela opcional porque el repo (create y update) y el spec OpenAPI
// del PATCH lo aceptan, aunque el form actual del front no lo mande: incluirlo
// mantiene ese camino funcionando sin que el strip lo borre.

// FK opcional: 0 / '' / null se interpretan como "sin FK" (undefined). Si viene un
// id real, se valida positivo. Mismo patrón que usuario.schema.ts / gasto.schema.ts.
const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

export const createCategoriaGastoSchema = z.object({
    nombre: z.string({ error: 'El nombre es obligatorio' }).trim().min(1, 'El nombre es obligatorio'),
    descripcion: z.string().optional(),
    activo: z.boolean().optional(),
    // Lo resuelve el controller; declarado para que el super_admin pueda elegir
    // tenant por body sin que el strip de Zod lo borre (ver cabecera).
    concesionariaId: optionalFk,
});

// PATCH parcial: todos los campos opcionales. Si viene `nombre`, no puede quedar
// vacío (una categoría sin nombre es inválida y rompería el unique
// [concesionariaId, nombre]); el `.trim()` normaliza espacios accidentales.
export const updateCategoriaGastoSchema = z.object({
    nombre: z.string().trim().min(1, 'El nombre no puede estar vacío').optional(),
    descripcion: z.string().optional(),
    activo: z.boolean().optional(),
});
