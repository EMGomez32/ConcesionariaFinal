import type { BadgeVariant } from '../ui/Badge';
import type { EstadoEntrega, FormaPagoVenta } from '../../types/venta.types';
import type { EstadoPresupuesto } from '../../types/presupuesto.types';
import type { EstadoReserva } from '../../api/reservas.api';

/**
 * Rótulos de los estados y catálogos de las pantallas comerciales (ventas,
 * presupuestos, reservas, financiación, ficha del cliente).
 *
 * Están juntos porque la misma venta se ve en cuatro lugares y cada pantalla
 * tenía su propio diccionario: la forma de pago "financiado_externo" era
 * "Crédito Prendario / Uva" en Ventas, "Crédito Prendario / UVA" en
 * Presupuestos, y en la ficha del cliente el estado salía crudo
 * ("convertida_en_venta"). Un estado de la base nunca se muestra tal cual.
 */

export interface EstadoMeta {
    label: string;
    variant: BadgeVariant;
}

/** Rótulo legible de un estado; si no está en el mapa, lo humaniza ("en_curso" → "En curso"). */
export const rotuloEstado = (mapa: Record<string, EstadoMeta>, estado: unknown): EstadoMeta => {
    const clave = String(estado ?? '');
    if (mapa[clave]) return mapa[clave];
    const texto = clave.replace(/_/g, ' ').trim();
    return { label: texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : '-', variant: 'default' };
};

export const ENTREGA_ESTADO: Record<EstadoEntrega, EstadoMeta> = {
    pendiente: { label: 'Pendiente', variant: 'warning' },
    bloqueada: { label: 'Bloqueada', variant: 'danger' },
    autorizada: { label: 'Autorizada', variant: 'info' },
    entregada: { label: 'Entregada', variant: 'success' },
    cancelada: { label: 'Anulada', variant: 'default' },
};

/** Estados de entrega que todavía no terminaron (ni entregada ni anulada). */
export const ENTREGA_PENDIENTE: EstadoEntrega[] = ['pendiente', 'bloqueada', 'autorizada'];

export const FORMA_PAGO_LABEL: Record<FormaPagoVenta, string> = {
    contado: 'Contado',
    transferencia: 'Transferencia',
    financiado_propio: 'Financiación propia',
    financiado_externo: 'Crédito prendario / UVA',
    canje_mas_diferencia: 'Canje más diferencia',
    mixto: 'Mixto',
};

export const FORMA_PAGO_OPTIONS = (Object.keys(FORMA_PAGO_LABEL) as FormaPagoVenta[])
    .map((value) => ({ value, label: FORMA_PAGO_LABEL[value] }));

export const METODO_PAGO_LABEL: Record<string, string> = {
    efectivo: 'Efectivo',
    transferencia: 'Transferencia',
    tarjeta: 'Tarjeta',
    cheque: 'Cheque',
    otro: 'Otro',
};

export const PRESUPUESTO_ESTADO: Record<EstadoPresupuesto, EstadoMeta> = {
    borrador: { label: 'Borrador', variant: 'default' },
    enviado: { label: 'Enviado', variant: 'info' },
    aceptado: { label: 'Aceptado', variant: 'success' },
    rechazado: { label: 'Rechazado', variant: 'danger' },
    vencido: { label: 'Vencido', variant: 'warning' },
    cancelado: { label: 'Anulado', variant: 'default' },
};

export const RESERVA_ESTADO: Record<EstadoReserva, EstadoMeta> = {
    activa: { label: 'Activa', variant: 'success' },
    convertida_en_venta: { label: 'Convertida en venta', variant: 'info' },
    cancelada: { label: 'Cancelada', variant: 'default' },
    vencida: { label: 'Vencida', variant: 'danger' },
};

export const FINANCIACION_ESTADO: Record<string, EstadoMeta> = {
    activa: { label: 'Activa', variant: 'success' },
    en_mora: { label: 'En mora', variant: 'danger' },
    cancelada: { label: 'Cerrada', variant: 'default' },
    refinanciada: { label: 'Refinanciada', variant: 'info' },
};

export const SOLICITUD_ESTADO: Record<string, EstadoMeta> = {
    borrador: { label: 'Borrador', variant: 'default' },
    enviada: { label: 'Enviada', variant: 'info' },
    pendiente: { label: 'Pendiente', variant: 'warning' },
    aprobada: { label: 'Aprobada', variant: 'success' },
    rechazada: { label: 'Rechazada', variant: 'danger' },
    cancelada: { label: 'Cancelada', variant: 'default' },
};

export const POSTVENTA_ESTADO: Record<string, EstadoMeta> = {
    pendiente: { label: 'Pendiente', variant: 'warning' },
    en_curso: { label: 'En curso', variant: 'info' },
    resuelto: { label: 'Resuelto', variant: 'success' },
};

export const VEHICULO_ESTADO: Record<string, EstadoMeta> = {
    preparacion: { label: 'En preparación', variant: 'default' },
    publicado: { label: 'Publicado', variant: 'success' },
    reservado: { label: 'Reservado', variant: 'warning' },
    vendido: { label: 'Vendido', variant: 'info' },
    devuelto: { label: 'Devuelto', variant: 'default' },
};
