import { z } from 'zod';

// Schemas de validación de categorías de gasto fijo. Payload verificado contra el
// DTO real del front (gastos-fijos-categorias.api.ts):
//   create -> { nombre: string; activo?: boolean }
//   update -> { nombre?: string; activo?: boolean }
//
// El controller resuelve el tenant (body para super_admin, token para el resto).
// La extensión RLS inyecta `concesionariaId` para el NO super_admin, pero NO para
// super_admin, así que ese campo tiene que SOBREVIVIR al strip de Zod para que el
// super_admin pueda elegir concesionaria por body (mismo criterio que
// usuario.schema.ts). z.object descarta cualquier otra clave (anti mass-assignment).
//
// `activo` se valida como z.boolean() (NO z.coerce.boolean(), que convertiría el
// string 'false' en true). El front manda un boolean JSON real, así que es seguro.

// FK opcional: 0 / '' / null → "sin FK" (undefined); un id real se valida positivo.
const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

export const createCategoriaGastoFijoSchema = z.object({
    nombre: z.string({ error: 'El nombre es obligatorio' }).min(1, 'El nombre es obligatorio'),
    activo: z.boolean().optional(),
    // Lo resuelve el controller; declarado para que el super_admin pueda elegir
    // tenant por body sin que el strip de Zod lo borre (ver cabecera).
    concesionariaId: optionalFk,
});

// PATCH parcial: renombrar y/o archivar. Ambos campos opcionales; si viene
// `nombre`, no puede ser vacío. Si no viene ninguno, el use-case simplemente no
// actualiza nada (pickEditable devuelve {}), comportamiento ya existente.
export const updateCategoriaGastoFijoSchema = z.object({
    nombre: z.string().min(1, 'El nombre no puede estar vacío').optional(),
    activo: z.boolean().optional(),
});
