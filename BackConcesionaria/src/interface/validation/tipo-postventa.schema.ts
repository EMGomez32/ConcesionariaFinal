import { z } from 'zod';

// Schemas de validación del catálogo de tipos de postventa. Migración 1:1 de
// modules/postventa-tipos/tipo.validation.ts (express-validator). Payload
// verificado contra el front (postventa.api.ts: createTipo/updateTipo mandan
// { nombre, activo? }) y el whitelist EDITABLE del repo
// (PrismaTipoPostventaRepository): ['nombre', 'activo'].
//
// Zod DESCARTA claves desconocidas: sólo esos dos campos persisten (+ el
// concesionariaId que resuelve el controller en create).

const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

// express-validator hacía `.trim().notEmpty().isLength({ max: 60 })`. El `.trim()`
// es un SANITIZER: recorta el valor ANTES de validar largo y vacío, y el repo
// vuelve a trimear al persistir. Réplica en Zod: `.trim()` transforma primero, y
// min(1)/max(60) validan sobre el string ya recortado (mismo orden que el chain).
const nombreCreate = z
    .string({ error: 'El nombre es obligatorio' })
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(60, 'El nombre no puede superar los 60 caracteres');

const nombreUpdate = z
    .string()
    .trim()
    .min(1, 'El nombre no puede quedar vacío')
    .max(60, 'El nombre no puede superar los 60 caracteres')
    .optional();

export const createTipoPostventaSchema = z.object({
    // super_admin elige tenant por body; debe sobrevivir al strip (lo lee
    // TipoPostventaController.create vía resolveConcesionariaId).
    concesionariaId: optionalFk,
    nombre: nombreCreate,
    // `.optional().isBoolean()`; el front lo manda como boolean real (Prisma
    // default true).
    activo: z.boolean().optional(),
});

export const updateTipoPostventaSchema = z.object({
    nombre: nombreUpdate,
    activo: z.boolean().optional(),
    // Sin concesionariaId: el repo no lo persiste en update.
});
