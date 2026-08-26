import { z } from 'zod';
import { HORAS_VIGENCIA_MAX } from '../../application/services/precioAutorizacion';

/**
 * Schemas del flujo de autorización del precio mínimo de venta.
 *
 * La lista explícita corta el mass-assignment igual que el resto de los schemas:
 * el body no puede traer `estado`, `precioAutorizado`, `resueltaPorId` ni
 * `venceEl` en el ALTA — esos los escribe `resolver()`, que exige rol admin. Sin
 * este strip, un vendedor se autoautorizaba mandando
 * `{ estado: 'autorizada', precioAutorizado: 1 }` en el POST.
 */

const optionalFk = z.coerce.number().int().positive().optional();

export const crearSolicitudPrecioMinimoSchema = z.object({
    vehiculoId: z.coerce.number({ error: 'El vehículo es obligatorio' }).int().positive(),
    // La atención en curso, si el pedido salió del mostrador. Opcional: también se
    // pide desde la ficha del vehículo, sin visita abierta.
    atencionId: optionalFk,
    motivo: z.string().max(500, 'El motivo es demasiado largo').optional(),
});

export const resolverSolicitudPrecioMinimoSchema = z.object({
    autorizar: z.coerce.boolean({ error: 'Indicá si autorizás o rechazás' }),
    // Piso puntual para este negocio. Si no viene, `resolver()` toma el de la
    // ficha; si la ficha tampoco lo tiene, el pedido se rechaza con 400 en vez de
    // autorizar un `null` que después se lee como "sin piso".
    precioAutorizado: z.coerce.number().positive('El precio autorizado debe ser mayor a cero').optional(),
    respuesta: z.string().max(500, 'La respuesta es demasiado larga').optional(),
    // Vigencia en horas. El tope duro vive en el service (una sola fuente de
    // verdad); acá se valida el rango para devolver un 400 legible en vez de
    // recortar en silencio.
    horasVigencia: z.coerce.number().int().min(1).max(HORAS_VIGENCIA_MAX).optional(),
});
