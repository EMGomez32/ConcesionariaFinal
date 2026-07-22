import { z } from 'zod';

// Schemas de validación de concesionarias (los TENANTS). Payloads verificados
// contra los DTOs reales del front:
//   - ConcesionariaForm.tsx  -> POST / y PATCH /:id (super_admin)
//   - ConfiguracionPage.tsx  -> PATCH /me (autogestión del admin del tenant)
// Ambos forms mandan SIEMPRE los cinco campos como string, y los opcionales
// pueden llegar en '' cuando el usuario los deja vacíos o los limpia.
//
// La lista explícita CORTA el mass-assignment: los use-cases pasan el body crudo
// a Prisma (`repository.create(data)` / `repository.update(id, data)` -> Prisma
// `create({ data })` / `update({ data })`), así que sin esto se podían inyectar
// columnas arbitrarias (id, deletedAt, createdAt, o incluso relaciones). Zod
// descarta todo lo no declarado.

// Campos de texto libre opcionales. A PROPÓSITO se aceptan como string SIN
// enforcement de formato y SIN transformar '' -> undefined:
//   - El front manda '' para "limpiar" un campo. En update ese '' se persiste
//     (o el controller de /me lo convierte a null). Si lo transformáramos a
//     undefined, el strip lo borraría y el campo NUNCA se podría limpiar
//     (cambio de conducta respecto de hoy).
//   - No se usa .email() en `email`: el input ya valida formato con type="email"
//     en el front, y el '' de limpieza haría fallar un .email() estricto ->
//     rechazaría un request válido (viola la regla de oro nº1).
const textoOpcional = z.string().optional();

export const createConcesionariaSchema = z.object({
    nombre: z.string({ error: 'El nombre es obligatorio' }).min(1, 'El nombre es obligatorio'),
    cuit: textoOpcional,
    email: textoOpcional,
    telefono: textoOpcional,
    direccion: textoOpcional,
});

// PATCH parcial. Reutilizado por PATCH /:id (super_admin) y PATCH /me
// (autogestión admin): mismos campos, todos opcionales. `nombre`, si viene, no
// puede quedar vacío (columna NOT NULL en DB; además ambos forms garantizan que
// se manda non-empty, así que este .min(1) nunca rechaza un request real).
export const updateConcesionariaSchema = z.object({
    nombre: z.string().min(1, 'El nombre no puede quedar vacío').optional(),
    cuit: textoOpcional,
    email: textoOpcional,
    telefono: textoOpcional,
    direccion: textoOpcional,
});
