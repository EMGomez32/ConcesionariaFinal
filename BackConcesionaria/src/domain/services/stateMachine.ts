import { BaseException } from '../exceptions/BaseException';

type Transitions = Record<string, readonly string[]>;

const machines: Record<string, Transitions> = {
    vehiculo: {
        preparacion: ['publicado', 'devuelto'],
        publicado: ['reservado', 'preparacion', 'vendido', 'devuelto'],
        reservado: ['publicado', 'vendido'],
        vendido: ['devuelto'],
        devuelto: [],
    },
    presupuesto: {
        borrador: ['enviado', 'cancelado'],
        enviado: ['aceptado', 'rechazado', 'vencido', 'cancelado'],
        aceptado: ['cancelado'],
        rechazado: [],
        vencido: [],
        cancelado: [],
    },
    ventaEntrega: {
        pendiente: ['bloqueada', 'autorizada', 'cancelada'],
        bloqueada: ['autorizada', 'cancelada'],
        autorizada: ['entregada', 'cancelada'],
        entregada: [],
        cancelada: [],
    },
    reserva: {
        activa: ['vencida', 'cancelada', 'convertida_en_venta'],
        vencida: [],
        cancelada: [],
        convertida_en_venta: [],
    },
    financiacion: {
        activa: ['cancelada', 'en_mora', 'refinanciada'],
        en_mora: ['activa', 'cancelada', 'refinanciada'],
        refinanciada: [],
        cancelada: [],
    },
    postventa: {
        pendiente: ['en_curso', 'resuelto'],
        en_curso: ['resuelto'],
        resuelto: [],
    },
    solicitudFinanciacion: {
        borrador: ['enviada', 'cancelada'],
        enviada: ['pendiente', 'cancelada'],
        pendiente: ['aprobada', 'rechazada', 'cancelada'],
        aprobada: [],
        rechazada: [],
        cancelada: [],
    },
    suscripcion: {
        trialing: ['active', 'canceled', 'paused'],
        active: ['past_due', 'canceled', 'paused'],
        past_due: ['active', 'canceled', 'paused'],
        paused: ['active', 'canceled'],
        canceled: [],
    },
};

export type StateMachineName = keyof typeof machines;

export function isValidTransition(machine: StateMachineName, from: string, to: string): boolean {
    if (from === to) return true;
    const transitions = machines[machine];
    const allowed = transitions?.[from];
    return Array.isArray(allowed) && allowed.includes(to);
}

export function assertValidTransition(machine: StateMachineName, from: string, to: string): void {
    if (!isValidTransition(machine, from, to)) {
        throw new BaseException(
            422,
            `Transición de estado inválida: '${from}' → '${to}' en '${machine}'`,
            'INVALID_STATE_TRANSITION'
        );
    }
}
