import { z } from 'zod';

// Schema de validación de items de postventa. Migración 1:1 de
// modules/postventa-items/item.validation.ts (express-validator). Payload
// verificado contra el DTO real del front (postventa.api.ts: CreateItemDto) y el
// form (PostventaPage.tsx: itemForm). Campos que persiste el repo
// (PrismaPostventaItemRepository.EDITABLE): casoId, fecha, descripcion, monto,
// proveedorId, comprobanteUrl. Zod descarta lo no declarado => corta el
// mass-assignment.
//
// NO se declara concesionariaId: el item NO recibe inyección del controller
// (PostventaItemController.create llama al use-case con req.body crudo); el tenant
// lo hereda del caso vía trigger de la base. Sólo hay endpoint de create (no update).

// Entero obligatorio (FK requerida): isInt({ min: 1 }).
const requiredId = (msg: string) =>
    z.coerce.number({ error: msg }).int(msg).positive(msg);

// FK opcional. El front manda `proveedorId || undefined` (nunca null ni 0), pero
// se preserva null igual por consistencia con el resto de los schemas. Sólo '' se
// colapsa a undefined.
const nullableInt = () =>
    z.preprocess(
        (v) => (v === '' ? undefined : v),
        z.coerce.number().int().positive().nullable().optional(),
    );

const nullableString = () =>
    z.preprocess(
        (v) => (v === '' ? undefined : v),
        z.string().nullable().optional(),
    );

export const createItemSchema = z.object({
    casoId: requiredId('casoId es obligatorio'),
    // El repo hace `new Date(fecha)`; el front manda 'YYYY-MM-DD' del <input date>.
    // Se valida como string (igual que las fechas de venta.schema).
    fecha: z.string({ error: 'fecha debe ser una fecha válida' }).min(1, 'fecha debe ser una fecha válida'),
    descripcion: z.string({ error: 'La descripción es obligatoria' }).min(1, 'La descripción es obligatoria'),
    // isDecimal() + custom(v >= 0): el monto no puede ser negativo, pero SÍ puede
    // ser 0 (mantener la laxitud del validation viejo: no se usa .positive()).
    monto: z.coerce.number({ error: 'monto debe ser un número' }).min(0, 'El monto no puede ser negativo'),
    proveedorId: nullableInt(),
    comprobanteUrl: nullableString(),
});
