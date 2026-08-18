import { z } from 'zod';

// Schemas de validación del recurso cliente. Migración 1:1 de
// modules/clientes/cliente.validation.ts (express-validator). Payload verificado
// contra el DTO real del front (clientes.api.ts usa Partial<Cliente> =>
// types/cliente.types.ts) y el pickEditable del repo (PrismaClienteRepository).
//
// IMPORTANTE — Zod DESCARTA las claves desconocidas (a diferencia de
// express-validator, que las dejaba pasar y el repo recortaba con pickEditable).
// Por eso hay que DECLARAR todos los campos que el repo persiste, no sólo los que
// express-validator validaba. Los CAMPOS del pickEditable son:
//   ['nombre', 'dni', 'telefono', 'email', 'direccion', 'observaciones']
// El bloque @openapi de la ruta menciona `apellido` y `cuit`, pero NO existen en
// el modelo Prisma, ni en el tipo del front, ni en pickEditable => son restos de
// doc; no se modelan (nadie los manda y el repo igual los descartaría).

// FK opcional: 0 / '' / null => "sin FK" (undefined). Mismo patrón que
// venta.schema.ts / usuario.schema.ts.
const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

// Réplica exacta del `body('email').optional({ checkFalsy: true }).isEmail()`:
// el form manda `email: ''` cuando se deja en blanco y un cliente sin email es lo
// normal. `checkFalsy` trataba '' como ausente => acá '' se convierte en undefined
// (no se valida ni rechaza). Un email real sigue exigiendo formato válido.
const emailOpcional = z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().email('Email inválido').optional(),
);

// FK que SÍ admite null explícito (para DESASIGNAR): '' / 0 / null => null (borra la
// asignación), un id positivo => asigna, ausente (undefined) => no se toca. A
// diferencia de optionalFk, no colapsa el null a undefined (si no, no se podría limpiar).
const nullableFk = z.preprocess(
    (v) => (v === '' || v === 0 || v === null ? null : v),
    z.coerce.number().int().positive().nullable().optional(),
);

// Etapa del embudo comercial (espejo del enum EstadoLead de Prisma). Opcional: en
// create el default de la DB es `nuevo`; en update sólo viene cuando se cambia.
const estadoLeadEnum = z.enum(['nuevo', 'contactado', 'negociando', 'ganado', 'perdido'], {
    error: 'Estado inválido. Válidos: nuevo, contactado, negociando, ganado, perdido',
}).optional();

// Datos fiscales del receptor (AFIP). El '' del form (limpieza) → null. Todo
// opcional: un cliente sin estos datos se factura como consumidor final (B).
const tipoDocOpcional = z.preprocess(
    (v) => (v === '' ? null : v),
    z.enum(['CUIT', 'CUIL', 'DNI', 'CF']).nullable().optional(),
);
const condicionIvaOpcional = z.preprocess(
    (v) => (v === '' ? null : v),
    z.enum(['responsable_inscripto', 'monotributo', 'exento', 'consumidor_final']).nullable().optional(),
);

export const createClienteSchema = z.object({
    // Lo inyecta el controller (resolveConcesionariaId) para un admin desde el
    // token; el super_admin lo elige por body y DEBE sobrevivir al strip de Zod,
    // porque ClienteController.create lee req.body.concesionariaId luego de que
    // validate reemplaza req.body por el parseado. Mismo reparto que usuario.
    concesionariaId: optionalFk,
    nombre: z.string({ error: 'El nombre es obligatorio' }).min(1, 'El nombre es obligatorio'),
    // express-validator: `.optional().isString()` (sólo skip en undefined; '' es un
    // string válido y pasa). z.string().optional() replica ese comportamiento.
    dni: z.string().optional(),
    telefono: z.string().optional(),
    email: emailOpcional,
    direccion: z.string().optional(),
    observaciones: z.string().optional(),
    estadoLead: estadoLeadEnum,
    vendedorAsignadoId: nullableFk,
    tipoDoc: tipoDocOpcional,
    condicionIva: condicionIvaOpcional,
});

export const updateClienteSchema = z.object({
    // `.optional().notEmpty()`: si viene, no puede quedar vacío.
    nombre: z.string().min(1, 'El nombre no puede estar vacío').optional(),
    dni: z.string().optional(),
    telefono: z.string().optional(),
    email: emailOpcional,
    direccion: z.string().optional(),
    observaciones: z.string().optional(),
    estadoLead: estadoLeadEnum,
    vendedorAsignadoId: nullableFk,
    tipoDoc: tipoDocOpcional,
    condicionIva: condicionIvaOpcional,
    // Sin concesionariaId: el repo (pickEditable) no lo persiste en update, no hay
    // reasignación de tenant para clientes. Si viniera, Zod lo descarta => igual
    // que hoy (el repo lo recortaba).
});
