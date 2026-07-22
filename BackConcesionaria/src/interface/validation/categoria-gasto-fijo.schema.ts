import { z } from 'zod';

// Schemas de validación de categorías de gasto fijo. Payload verificado contra el
// DTO real del front (gastos-fijos-categorias.api.ts):
//   create -> { nombre: string; activo?: boolean }
//   update -> { nombre?: string; activo?: boolean }
//
// El repositorio ya persiste sólo ['nombre', 'activo'] (pickEditable) y
// `concesionariaId` lo inyecta la extensión RLS desde el token: NUNCA se toma del
// body, por eso no se declara acá. z.object descarta cualquier clave extra
// (anti mass-assignment): nadie puede colar concesionariaId / id / activo forzado.
//
// `activo` se valida como z.boolean() (NO z.coerce.boolean(), que convertiría el
// string 'false' en true). El front manda un boolean JSON real, así que es seguro.

export const createCategoriaGastoFijoSchema = z.object({
    nombre: z.string({ error: 'El nombre es obligatorio' }).min(1, 'El nombre es obligatorio'),
    activo: z.boolean().optional(),
});

// PATCH parcial: renombrar y/o archivar. Ambos campos opcionales; si viene
// `nombre`, no puede ser vacío. Si no viene ninguno, el use-case simplemente no
// actualiza nada (pickEditable devuelve {}), comportamiento ya existente.
export const updateCategoriaGastoFijoSchema = z.object({
    nombre: z.string().min(1, 'El nombre no puede estar vacío').optional(),
    activo: z.boolean().optional(),
});
