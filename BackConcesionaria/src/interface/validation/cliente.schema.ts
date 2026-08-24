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

// Canal por el que entró la consulta (espejo del enum OrigenLead de Prisma).
const ORIGENES_LEAD = ['deruedas', 'instagram', 'facebook', 'whatsapp', 'web', 'mostrador', 'referido', 'otro'] as const;
const MSG_ORIGEN = 'Origen inválido. Válidos: deruedas, instagram, facebook, whatsapp, web, mostrador, referido, otro';

// origenLead en create/update: nullable en DB (los históricos no lo registraron),
// así que el '' del form (limpieza) → null; ausente (undefined) → no se toca.
// Mismo reparto que tipoDoc/condicionIva.
const origenLeadOpcional = z.preprocess(
    (v) => (v === '' ? null : v),
    z.enum(ORIGENES_LEAD, { error: MSG_ORIGEN }).nullable().optional(),
);

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
    origenLead: origenLeadOpcional,
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
    origenLead: origenLeadOpcional,
    vendedorAsignadoId: nullableFk,
    tipoDoc: tipoDocOpcional,
    condicionIva: condicionIvaOpcional,
    // Sin concesionariaId: el repo (pickEditable) no lo persiste en update, no hay
    // reasignación de tenant para clientes. Si viniera, Zod lo descarta => igual
    // que hoy (el repo lo recortaba).
});

// Ingesta de una consulta de venta (lead) — POST /clientes/consulta. Cuerpo del
// keystone consultaIngest (ConsultaEntrante): acá `origen` es OBLIGATORIO (toda
// consulta entra por algún canal) y el resto del contacto es opcional (el dedupe
// tolera tel/email faltantes). vehiculoId/vendedorId: FK opcional, 0/''/null =
// "sin dato" (mismo patrón optionalFk del create).
export const consultaIngresoSchema = z.object({
    origen: z.enum(ORIGENES_LEAD, { error: MSG_ORIGEN }),
    nombre: z.string({ error: 'El nombre es obligatorio' }).min(1, 'El nombre es obligatorio'),
    telefono: z.string().optional(),
    email: emailOpcional,
    texto: z.string().optional(),
    vehiculoId: optionalFk,
    vendedorId: optionalFk,
});

// Import masivo de clientes — POST /clientes/import. Schema LAXO a propósito a
// nivel fila (strings sueltos, sin formato de email ni enum de origen): la
// validación fina es POR FILA en el servicio (clienteImport), que reporta cada
// error con su índice dentro del lote en vez de rechazar el lote entero con un
// 400. Acá sólo se valida la FORMA del sobre: 1..300 filas y las opciones.
export const importClientesSchema = z.object({
    filas: z.array(z.object({
        nombre: z.string().optional(),
        telefono: z.string().optional(),
        email: z.string().optional(),
        dni: z.string().optional(),
        observaciones: z.string().optional(),
        origenLead: z.string().optional(),
        vendedorAsignadoId: z.number({ error: 'vendedorAsignadoId debe ser un número' }).int().optional(),
    }))
        .min(1, 'El lote debe traer al menos una fila')
        .max(300, 'Máximo 300 filas por lote'),
    opciones: z.object({
        estadoInicial: z.enum(['contactado', 'nuevo'], { error: 'Estado inicial inválido. Válidos: contactado, nuevo' }),
        origenDefault: z.string().optional(),
        actualizarExistentes: z.boolean({ error: 'actualizarExistentes debe ser booleano' }),
    }),
});
