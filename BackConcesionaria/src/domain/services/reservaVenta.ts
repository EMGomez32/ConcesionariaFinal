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

/**
 * "Hoy" como fecha de calendario (YYYY-MM-DD) en Argentina, que es contra lo que se
 * compara el vencimiento de una seña (`venceEl` es @db.Date: medianoche UTC del
 * día). Con `toISOString()` a las 21 h de Buenos Aires ya sería "mañana".
 */
export function hoyEnArgentina(ahora: Date = new Date()): string {
    // en-CA formatea como YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(ahora);
}

/** Parte de fecha de un @db.Date / ISO, sin convertir de zona. */
const diaDe = (d: Date | string): string => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);

/**
 * ¿La seña ya venció? Vence EL día de `venceEl`: recién al día siguiente está
 * vencida (mismo criterio que la pantalla, `fecha < hoy`). Sin vencimiento, nunca.
 */
export function reservaYaVencio(venceEl: Date | string | null | undefined, hoy: string): boolean {
    if (!venceEl) return false;
    return diaDe(venceEl) < hoy;
}

/**
 * QUIÉN PUEDE TOCAR QUÉ DE UNA SEÑA (PROC-33). La ruta PATCH /reservas/:id está
 * abierta a admin y vendedor; los campos que mueven plata o liberan la unidad, no.
 *
 *  - Cancelar: sólo admin. Cancelar una seña ya cobrada es devolver plata y liberar
 *    la unidad; el vendedor que la tomó no puede ser el que la deshace.
 *  - Cambiar el monto: sólo admin. Es alterar una seña ya cobrada.
 *  - Marcar vencida: cualquiera, pero sólo si la fecha YA pasó. Antes de eso
 *    "vencida" es una cancelación con otro nombre (y sin motivo).
 *  - Mover el vencimiento a una fecha PASADA: sólo admin, por lo mismo (adelantarla
 *    a ayer y después marcarla vencida). Extenderla sí puede el vendedor: es el
 *    pedido corriente del cliente que necesita unos días más.
 *
 * Devuelve el problema (status + código + mensaje) o null. Pura, para testearla sola.
 */
export function problemaDeCambioDeReserva(args: {
    esAdmin: boolean;
    hoy: string;
    actual: { estado: string; montoSenia: number | null; venceEl: Date | string | null };
    cambios: { estado?: string; monto?: number | null; fechaVencimiento?: string | null };
}): { status: number; code: string; message: string } | null {
    const { esAdmin, hoy, actual, cambios } = args;

    if (cambios.estado === 'cancelada' && actual.estado !== 'cancelada' && !esAdmin) {
        return {
            status: 403, code: 'FORBIDDEN',
            message: 'Cancelar una seña es del administrador. Si el cliente se arrepintió, pedíselo con el motivo.',
        };
    }
    if (cambios.monto !== undefined && !esAdmin) {
        const nuevo = cambios.monto === null ? null : Number(cambios.monto);
        if (nuevo !== actual.montoSenia) {
            return { status: 403, code: 'FORBIDDEN', message: 'Cambiar el monto de una seña ya tomada es del administrador.' };
        }
    }
    if (cambios.fechaVencimiento !== undefined && cambios.fechaVencimiento && !esAdmin) {
        if (diaDe(cambios.fechaVencimiento) < hoy) {
            return {
                status: 403, code: 'FORBIDDEN',
                message: 'Podés extender el vencimiento de la seña, no moverlo a una fecha que ya pasó.',
            };
        }
    }
    if (cambios.estado === 'vencida' && actual.estado !== 'vencida' && !reservaYaVencio(actual.venceEl, hoy)) {
        return {
            status: 422, code: 'RESERVA_NO_VENCIDA',
            message: actual.venceEl
                ? `La seña vence el ${diaDe(actual.venceEl).split('-').reverse().join('/')}: todavía no se puede marcar vencida. Si se cae antes, la cancela un administrador.`
                : 'La seña no tiene fecha de vencimiento: no se puede marcar vencida. Si se cae, la cancela un administrador.',
        };
    }
    return null;
}
