import { z } from 'zod';

// Schemas de validación del recurso financiera. Migración 1:1 de
// modules/financieras/financiera.validation.ts (express-validator). Payload
// verificado contra el DTO del front (financieras.api.ts:
// CreateFinancieraDto / UpdateFinancieraDto) y el whitelist EDITABLE del repo
// (PrismaFinancieraRepository):
//   ['nombre', 'tipo', 'contacto', 'telefono', 'email', 'activo']
//
// Zod DESCARTA claves desconocidas: se declaran todos esos campos para no perder
// ninguno en el strip. `tipo` es un ENUM en Prisma (TipoFinanciera), a diferencia
// del `tipo` libre de proveedor.

const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

// `body('email').optional({ checkFalsy: true }).isEmail()`: '' => "sin email".
const emailOpcional = z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().email('Email inválido').optional(),
);

// Enum TipoFinanciera del schema.prisma (financiera | banco | otra). El mensaje
// replica el de express-validator (`Tipo inválido. Válidos: financiera, banco, otra`).
// Se deja `.optional()` (no checkFalsy): igual que el `.optional().isIn(...)`
// original, un tipo presente pero inválido ('' incluido) se rechaza; el front
// manda uno de los tres o nada (Prisma default `financiera`).
const tipoFinanciera = z
    .enum(['financiera', 'banco', 'otra'], { error: 'Tipo inválido. Válidos: financiera, banco, otra' })
    .optional();

export const createFinancieraSchema = z.object({
    // super_admin elige tenant por body; debe sobrevivir al strip (lo lee
    // FinancieraController.create vía resolveConcesionariaId).
    concesionariaId: optionalFk,
    nombre: z.string({ error: 'El nombre es obligatorio' }).min(1, 'El nombre es obligatorio'),
    tipo: tipoFinanciera,
    contacto: z.string().optional(),
    telefono: z.string().optional(),
    email: emailOpcional,
    // `.optional().isBoolean()`; el DTO manda boolean real.
    activo: z.boolean().optional(),
});

export const updateFinancieraSchema = z.object({
    nombre: z.string().min(1, 'El nombre no puede estar vacío').optional(),
    tipo: tipoFinanciera,
    contacto: z.string().optional(),
    telefono: z.string().optional(),
    email: emailOpcional,
    activo: z.boolean().optional(),
    // Sin concesionariaId: el repo no lo persiste en update.
});
