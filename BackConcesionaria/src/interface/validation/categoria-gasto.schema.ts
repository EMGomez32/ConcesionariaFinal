import { z } from 'zod';

// Schema de validación de categorías de gasto vehicular (CategoriaGastoVehiculo).
// Payload verificado contra el DTO real del front (gastos-categorias.api.ts):
//   create: { nombre: string; descripcion?: string }
//   update: { nombre?: string; descripcion?: string }
//
// El controller pasa `req.body` crudo al use-case; NO inyecta nada. La extensión
// RLS de Prisma inyecta `concesionariaId`, así que ese campo NUNCA se acepta del
// body. Zod descarta cualquier clave no declarada (anti mass-assignment); esto
// reemplaza el whitelist manual que hoy hace el repositorio.
//
// `activo` se modela opcional porque el repo (create y update) y el spec OpenAPI
// del PATCH lo aceptan, aunque el form actual del front no lo mande: incluirlo
// mantiene ese camino funcionando sin que el strip lo borre.

export const createCategoriaGastoSchema = z.object({
    nombre: z.string({ error: 'El nombre es obligatorio' }).trim().min(1, 'El nombre es obligatorio'),
    descripcion: z.string().optional(),
    activo: z.boolean().optional(),
});

// PATCH parcial: todos los campos opcionales. Si viene `nombre`, no puede quedar
// vacío (una categoría sin nombre es inválida y rompería el unique
// [concesionariaId, nombre]); el `.trim()` normaliza espacios accidentales.
export const updateCategoriaGastoSchema = z.object({
    nombre: z.string().trim().min(1, 'El nombre no puede estar vacío').optional(),
    descripcion: z.string().optional(),
    activo: z.boolean().optional(),
});
