import { z } from 'zod';

// Schemas de validación del recurso proveedor. Migración 1:1 de
// modules/proveedores/proveedor.validation.ts (express-validator). Payload
// verificado contra el DTO del front (proveedores.api.ts usa Partial<Proveedor>
// => types/proveedor.types.ts) y el pickEditable del repo
// (PrismaProveedorRepository), cuyos CAMPOS son:
//   ['nombre', 'tipo', 'telefono', 'email', 'direccion', 'activo']
//
// Zod DESCARTA claves desconocidas: se declaran TODOS esos campos para no
// introducir una regresión silenciosa (si falta uno, el strip de Zod lo borra
// antes de que el repo lo persista).

const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

// `body('email').optional({ checkFalsy: true }).isEmail()`: '' se deja pasar como
// "sin email". Réplica: '' => undefined (no valida ni rechaza); email real valida.
const emailOpcional = z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().email('Email inválido').optional(),
);

export const createProveedorSchema = z.object({
    // super_admin elige tenant por body; debe sobrevivir al strip (lo lee
    // ProveedorController.create vía resolveConcesionariaId). Admin/vendedor: lo
    // inyecta el controller desde el token.
    concesionariaId: optionalFk,
    nombre: z.string({ error: 'El nombre es obligatorio' }).min(1, 'El nombre es obligatorio'),
    // `tipo` es String? libre en Prisma (NO enum), express-validator sólo isString.
    tipo: z.string().optional(),
    telefono: z.string().optional(),
    email: emailOpcional,
    direccion: z.string().optional(),
    // express-validator: `.optional().isBoolean()`. El DTO del front manda boolean
    // real (activo?: boolean), z.boolean().optional() lo replica sin ser más estricto.
    activo: z.boolean().optional(),
});

export const updateProveedorSchema = z.object({
    nombre: z.string().min(1, 'El nombre no puede estar vacío').optional(),
    tipo: z.string().optional(),
    telefono: z.string().optional(),
    email: emailOpcional,
    direccion: z.string().optional(),
    activo: z.boolean().optional(),
    // Sin concesionariaId: el repo no lo persiste en update (no hay reasignación).
});
