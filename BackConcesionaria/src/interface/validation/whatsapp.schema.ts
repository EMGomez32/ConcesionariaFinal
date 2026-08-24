import { z } from 'zod';

/**
 * Schemas del canal de WhatsApp: cuentas vinculadas y bandeja de conversaciones.
 *
 * Zod descarta las claves no declaradas (validate.middleware reemplaza el body
 * por el parseado) => corta el mass-assignment. Ojo con lo que NO se declara a
 * propósito:
 *  - En la cuenta: `estado`, `numero`, `saludEstado`, `proximoEnvioAt`. Los
 *    escribe el socket / el worker anti-ban, nunca el cliente HTTP: aceptarlos
 *    por body dejaría a un admin adelantando su propio turno de envío.
 *  - En la conversación: `noLeidos`, `ultimoMensajeAt/Dir`, `clienteId`. Son
 *    derivados de los mensajes (el clienteId se vincula por registrar-consulta).
 */

// concesionariaId: lo resuelve el controller (resolveConcesionariaId) y el
// super_admin lo elige por body → debe SOBREVIVIR al strip del middleware.
const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

export const createCuentaSchema = z.object({
    // El alias es cómo se llama el número adentro del panel ("Ventas", "Postventa").
    // Único por concesionaria en la base: un alias repetido devuelve 409.
    alias: z
        .string({ error: 'El alias es obligatorio' })
        .trim()
        .min(1, 'El alias es obligatorio')
        .max(60, 'El alias no puede superar los 60 caracteres'),
    concesionariaId: optionalFk,
});

// Enum EstadoConversacion (prisma/schema.prisma).
const estadoConversacionEnum = z.enum(['abierta', 'cerrada', 'archivada'], {
    error: 'Estado inválido. Válidos: abierta, cerrada, archivada',
});

export const crearMensajeSchema = z.object({
    // Tope de 4096: es el límite de un mensaje de texto de WhatsApp. Cortarlo acá
    // evita encolar algo que el proveedor va a rechazar recién en el worker.
    contenido: z
        .string({ error: 'El mensaje no puede estar vacío' })
        .trim()
        .min(1, 'El mensaje no puede estar vacío')
        .max(4096, 'El mensaje no puede superar los 4096 caracteres'),
});

// PATCH parcial. asignadoAId PRESERVA null (des-asignar el hilo deja la
// conversación en la cola común); '' se colapsa a undefined (campo no tocado).
const nullableFk = (msg: string) =>
    z.preprocess(
        (v) => (v === '' ? undefined : v),
        z.coerce.number({ error: msg }).int(msg).positive(msg).nullable().optional(),
    );

export const updateConversacionSchema = z.object({
    estado: estadoConversacionEnum.optional(),
    asignadoAId: nullableFk('asignadoAId inválido'),
});
