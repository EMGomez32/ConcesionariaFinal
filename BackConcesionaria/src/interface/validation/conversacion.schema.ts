import { z } from 'zod';

/**
 * Schemas de la BANDEJA multi-canal (WhatsApp, DM de Instagram y Messenger,
 * comentarios de Instagram y de la página de Facebook).
 *
 * Vivían en whatsapp.schema.ts, que ahora se queda sólo con lo de las CUENTAS de
 * WhatsApp (vinculación por QR): la bandeja dejó de ser un canal para ser la
 * pantalla donde entran todos.
 *
 * Zod descarta las claves no declaradas (validate.middleware reemplaza el body
 * por el parseado) => corta el mass-assignment. Ojo con lo que NO se declara a
 * propósito: `noLeidos`, `ultimoMensajeAt/Dir`, `clienteId`, `canal`,
 * `ventanaVenceAt`. Son derivados de los mensajes y del canal que trajo el hilo
 * (el clienteId se vincula por registrar-consulta); aceptarlos por body dejaría
 * a un operador declarando abierta una ventana de Meta que está cerrada.
 */

// Enum EstadoConversacion (prisma/schema.prisma).
const estadoConversacionEnum = z.enum(['abierta', 'cerrada', 'archivada'], {
    error: 'Estado inválido. Válidos: abierta, cerrada, archivada',
});

/**
 * Tope de 8000: es el MÁXIMO absoluto entre los canales (una respuesta a un
 * comentario). El límite REAL es por canal —WhatsApp 4096, Messenger 2000, DM de
 * Instagram 1000— y no se puede validar acá porque el canal no está en el body:
 * sale de la conversación. Ese corte fino lo hace conversacionService al encolar
 * (400 MENSAJE_DEMASIADO_LARGO), que es donde se sabe a dónde va el mensaje.
 * Este tope es sólo la barrera contra un body absurdo.
 */
export const crearMensajeSchema = z.object({
    contenido: z
        .string({ error: 'El mensaje no puede estar vacío' })
        .trim()
        .min(1, 'El mensaje no puede estar vacío')
        .max(8000, 'El mensaje no puede superar los 8000 caracteres'),
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

/**
 * Datos que el vendedor completa al convertir el hilo en consulta.
 *
 * Los DOS son opcionales: en WhatsApp el hilo ya trae nombre y teléfono y el
 * body va vacío, como antes. Existen por los canales de Meta, donde el hilo
 * puede no tener ninguno de los dos (un DM de Instagram no trae teléfono y el
 * nombre depende de un permiso que puede no estar aprobado): sin ellos el alta
 * creaba un cliente llamado con el id opaco de Meta, sin forma de contactarlo.
 *
 * El teléfono se acepta con el formato que el vendedor tenga a mano (lo copia
 * del chat): normalizarlo es cosa de la ficha del cliente, y rechazar acá un
 * número con guiones sólo lograría que el lead no se registre.
 */
export const registrarConsultaSchema = z.preprocess(
    // Sin body (el caso de WhatsApp, donde no hay nada que completar) el POST
    // tiene que seguir funcionando igual que antes: undefined/null = {}.
    (v) => (v == null ? {} : v),
    z.object({
        nombre: z.string().trim().max(150, 'El nombre no puede superar los 150 caracteres').optional(),
        telefono: z.string().trim().max(40, 'El teléfono no puede superar los 40 caracteres').optional(),
    }),
);
