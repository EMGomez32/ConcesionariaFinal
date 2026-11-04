import { z } from 'zod';
import { TIPOS_SOLICITUD_TITULAR } from '../../domain/services/plazosTitular';

/**
 * Schemas de los derechos del titular (PRIV-05). Los motivos son OBLIGATORIOS en todo lo
 * que bloquea o suprime: el rastro tiene que poder explicar por qué se hizo, y "porque
 * sí" no es una respuesta que se le pueda dar a un titular ni a un auditor.
 */

const motivo = z
    .string({ error: 'Escribí el motivo' })
    .trim()
    .min(5, 'Escribí el motivo (al menos 5 caracteres)')
    .max(1000, 'El motivo no puede superar los 1000 caracteres');

const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

/**
 * La supresión es IRREVERSIBLE. Además del motivo, el body tiene que traer la palabra
 * SUPRIMIR escrita a mano: es la confirmación fuerte que pide la pantalla, repetida en el
 * backend para que un script o un doble click no la salteen.
 */
export const suprimirTitularSchema = z.object({
    motivo,
    confirmacion: z.literal('SUPRIMIR', { error: 'Para confirmar, escribí SUPRIMIR en mayúsculas' }),
});

export const motivoSchema = z.object({ motivo });

/** En la revocación el motivo es opcional: es un derecho del titular y no tiene que justificarlo. */
export const revocarConsentimientoSchema = z.object({
    motivo: z.string().trim().max(1000, 'El motivo no puede superar los 1000 caracteres').optional(),
});

const fechaDia = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha tiene que tener el formato AAAA-MM-DD')
    .refine((s) => !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()), 'La fecha no es válida');

export const crearSolicitudTitularSchema = z.object({
    // Sólo lo usa el super_admin (resolveConcesionariaId); para el resto se ignora.
    concesionariaId: optionalFk,
    tipo: z.enum(TIPOS_SOLICITUD_TITULAR as [string, ...string[]], {
        error: 'Elegí el tipo de pedido: acceso, rectificación, supresión, bloqueo u oposición',
    }),
    titularNombre: z.string({ error: 'Escribí el nombre del titular' }).trim().min(2, 'Escribí el nombre del titular').max(200),
    clienteId: optionalFk,
    canal: z.string().trim().max(100).optional(),
    detalle: z.string().trim().max(2000).optional(),
    recibidaEl: fechaDia.optional(),
});

export const actualizarSolicitudTitularSchema = z.object({
    estado: z.enum(['pendiente', 'en_curso', 'resuelta', 'rechazada'], { error: 'Elegí un estado válido' }).optional(),
    resolucion: z.string().trim().max(4000).optional(),
    canal: z.string().trim().max(100).optional(),
    detalle: z.string().trim().max(2000).optional(),
    clienteId: z.preprocess(
        (v) => (v === '' || v === 0 ? null : v),
        z.coerce.number().int().positive().nullable().optional(),
    ),
});
