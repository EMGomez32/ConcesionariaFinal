import { z } from 'zod';

// Schemas de validación de casos de postventa. Migración 1:1 de
// modules/postventa-casos/caso.validation.ts (express-validator). Payloads
// verificados contra el DTO real del front (postventa.api.ts: CreateCasoDto /
// UpdateCasoDto) y el form (PostventaPage.tsx). Campos que persiste el repo
// (PrismaPostventaCasoRepository): EDITABLE_CREATE = clienteId, vehiculoId,
// sucursalId, ventaId, fechaReclamo, tipoId, descripcion; EDITABLE_UPDATE =
// estado, tipoId, descripcion, fechaReclamo, fechaCierre. Zod descarta lo no
// declarado => corta el mass-assignment (el update quedaba abierto a
// {"deletedAt":...} para vendedor/postventa, que borraba el caso).
//
// `estado` NO se declara en create: el repo lo fuerza a 'pendiente' (todo caso
// arranca ahí). La máquina de estados (UpdateCaso) valida las transiciones; acá
// sólo se chequea que el valor del enum exista.

// Enum EstadoPostventa (prisma/schema.prisma).
const estadoEnum = z.enum(['pendiente', 'en_curso', 'resuelto'], {
    error: 'Estado inválido. Válidos: pendiente, en_curso, resuelto',
});

// Entero obligatorio (FK requerida): isInt({ min: 1 }) del validation viejo.
const requiredId = (msg: string) =>
    z.coerce.number({ error: msg }).int(msg).positive(msg);

// FK opcional que PRESERVA null (para poder des-asignar tipoId en la edición; el
// repo lo persiste como null). Sólo '' se colapsa a undefined. Mismo criterio que
// gasto-fijo.schema.ts.
const nullableInt = (msg?: string) => {
    const base = msg
        ? z.coerce.number({ error: msg }).int(msg).positive(msg)
        : z.coerce.number().int().positive();
    return z.preprocess((v) => (v === '' ? undefined : v), base.nullable().optional());
};

// Fecha nullable: el repo hace `new Date(x)` salvo que sea null (fechaCierre se
// puede vaciar). Se valida como string, igual que fechaVenta en venta.schema
// (Prisma/el repo convierten a Date; el front manda 'YYYY-MM-DD' del <input date>).
const nullableFecha = () =>
    z.preprocess((v) => (v === '' ? undefined : v), z.string().nullable().optional());

// concesionariaId: lo resuelve el controller (resolveConcesionariaId) y el
// super_admin lo elige por body → debe SOBREVIVIR al strip de validate.middleware,
// si no el CreateCaso llega sin tenant (500). Ver cabecera de gasto-fijo.schema.ts.
const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

export const createCasoSchema = z.object({
    clienteId: requiredId('clienteId es obligatorio'),
    vehiculoId: requiredId('vehiculoId es obligatorio'),
    sucursalId: requiredId('sucursalId es obligatorio'),
    // ventaId es obligatorio (schema: `ventaId Int`): el reclamo siempre es sobre
    // una unidad vendida. Sin esto el form manda 0 y explota la FK con un 500.
    ventaId: requiredId('Indicá sobre qué venta es el reclamo'),
    fechaReclamo: z
        .string({ error: 'fechaReclamo debe ser una fecha válida' })
        .min(1, 'fechaReclamo debe ser una fecha válida'),
    descripcion: z.string({ error: 'La descripción es obligatoria' }).min(1, 'La descripción es obligatoria'),
    // Opcional: el tipo (catálogo TipoPostventa) puede no saberse al abrir el caso.
    tipoId: nullableInt('tipoId inválido'),
    concesionariaId: optionalFk,
});

// PATCH parcial. No se declara concesionariaId: el controller.update no lo
// resuelve y el repo no lo tiene en EDITABLE_UPDATE.
export const updateCasoSchema = z.object({
    estado: estadoEnum.optional(),
    tipoId: nullableInt('tipoId inválido'),
    descripcion: z.string().min(1, 'La descripción no puede quedar vacía').optional(),
    fechaReclamo: z.string().optional(),
    fechaCierre: nullableFecha(),
});
