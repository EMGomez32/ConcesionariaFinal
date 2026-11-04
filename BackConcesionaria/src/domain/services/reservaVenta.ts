import { BaseException } from '../exceptions/BaseException';

/**
 * Reglas que unen reserva, venta y estado del vehículo. Son puras (sin base) para
 * poder probarlas solas; los use-cases las aplican DENTRO de la transacción, con el
 * vehículo lockeado (SELECT ... FOR UPDATE).
 *
 * El problema que resuelven: antes cancelar o vencer una reserva devolvía el vehículo
 * a 'publicado' SIN mirar cómo estaba. Un auto ya vendido volvía a ofrecerse, y una
 * venta podía cerrarse sobre un auto reservado para OTRO cliente sin tocar su seña.
 */

export interface ReservaActivaDelVehiculo {
    id: number;
    clienteId: number;
}

export interface ReservaSolicitada {
    id: number;
    vehiculoId: number;
    estado: string;
}

export interface PlanReservasDeVenta {
    /** Reserva que la venta consume (pasa a 'convertida_en_venta'), o null. */
    consumir: number | null;
    /** Otras reservas activas del mismo auto: ya no se pueden honrar → 'cancelada'. */
    cancelar: number[];
}

/**
 * Qué pasa con las reservas del vehículo cuando se lo VENDE.
 *
 *  - Con `reservaId`: tiene que existir, ser DE ESE vehículo y estar activa. Antes no se
 *    validaba: se podía "convertir" una reserva de otro auto o una ya cancelada.
 *  - Sin `reservaId` y el auto está 'reservado': si la reserva activa es del MISMO
 *    cliente que compra, se consume sola (es su seña); si es de OTRO cliente se rechaza
 *    (409): habría que cancelar esa reserva a propósito, no pisarla en silencio.
 *  - Auto 'reservado' pero sin reservas activas (estado inconsistente, p. ej. editado a
 *    mano): se permite la venta, o el auto quedaría trabado para siempre.
 */
export function resolverReservasParaVenta(input: {
    estadoVehiculo: string;
    vehiculoId: number;
    clienteId: number;
    reservaId?: number | null;
    reservaSolicitada?: ReservaSolicitada | null;
    reservasActivas: ReservaActivaDelVehiculo[];
}): PlanReservasDeVenta {
    const { estadoVehiculo, vehiculoId, clienteId, reservaId, reservaSolicitada, reservasActivas } = input;

    let consumir: number | null = null;

    if (reservaId) {
        if (!reservaSolicitada) {
            throw new BaseException(400, 'La reserva indicada no existe', 'RESERVA_INVALIDA');
        }
        if (reservaSolicitada.vehiculoId !== vehiculoId) {
            throw new BaseException(400, 'La reserva indicada no corresponde a ese vehículo', 'RESERVA_INVALIDA');
        }
        if (reservaSolicitada.estado !== 'activa') {
            throw new BaseException(
                400,
                `La reserva indicada no está activa (estado: ${reservaSolicitada.estado})`,
                'RESERVA_INVALIDA',
            );
        }
        consumir = reservaSolicitada.id;
    } else {
        const propia = reservasActivas.find((r) => r.clienteId === clienteId);
        if (propia) {
            consumir = propia.id;
        } else if (estadoVehiculo === 'reservado' && reservasActivas.length > 0) {
            throw new BaseException(
                409,
                'El vehículo está reservado para otro cliente. Cancelá esa reserva o convertila en venta antes de venderlo.',
                'VEHICULO_RESERVADO',
            );
        }
    }

    return {
        consumir,
        cancelar: reservasActivas.map((r) => r.id).filter((id) => id !== consumir),
    };
}

/**
 * ¿Cancelar/vencer una reserva devuelve el auto a 'publicado'? SÓLO si sigue
 * 'reservado' y no queda otra reserva activa sobre él. Si ya está 'vendido' (o en
 * cualquier otro estado) no se toca: antes se lo pisaba a 'publicado' y se volvía a
 * ofrecer una unidad vendida.
 */
export function debeLiberarVehiculo(estadoVehiculo: string | undefined, otrasReservasActivas: number): boolean {
    return estadoVehiculo === 'reservado' && otrasReservasActivas === 0;
}
