import { api } from './client';
import { Importe } from './atenciones.api';
import type { BadgeTone } from '../components/ui';

/** API de Ventas para el vendedor. Lista + detalle (con pagos). */

export type FormaPagoVenta = 'contado' | 'transferencia' | 'financiado_propio' | 'financiado_externo' | 'canje_mas_diferencia' | 'mixto';
export type EstadoEntrega = 'pendiente' | 'bloqueada' | 'autorizada' | 'entregada' | 'cancelada';

export interface VentaPago {
    id: number;
    monto: Importe;
    metodo: string;
    referencia?: string | null;
}

export interface Venta {
    id: number;
    vehiculoId: number;
    clienteId: number;
    fechaVenta: string;
    precioVenta: Importe;
    moneda: string;
    formaPago: FormaPagoVenta;
    estadoEntrega: EstadoEntrega;
    fechaEntrega?: string | null;
    observaciones?: string | null;
    vehiculo?: { marca: string; modelo: string; dominio?: string | null };
    cliente?: { nombre: string; email?: string | null };
    vendedor?: { nombre: string };
    pagos?: VentaPago[];
}

interface Paginado<T> { results: T[]; page: number; limit: number; totalPages: number; totalResults: number }

export interface CreateVentaDto {
    sucursalId: number;
    clienteId: number;
    vendedorId: number;
    vehiculoId: number;
    precioVenta: number;
    moneda: 'ARS' | 'USD';
    formaPago: FormaPagoVenta;
    fechaVenta: string;
    observaciones?: string;
}

export const ventasApi = {
    list: (search?: string, page = 1, limit = 30) =>
        api.get('/ventas', { params: { ...(search ? { search } : {}), page, limit } })
            .then((r) => r.data as Paginado<Venta>),
    getById: (id: number) => api.get(`/ventas/${id}`).then((r) => r.data as Venta),
    create: (data: CreateVentaDto) => api.post('/ventas', data).then((r) => r.data as Venta),
};

export const FORMAS_PAGO: FormaPagoVenta[] = ['contado', 'transferencia', 'financiado_propio', 'financiado_externo', 'canje_mas_diferencia', 'mixto'];

export const FORMA_PAGO_LABEL: Record<FormaPagoVenta, string> = {
    contado: 'Contado', transferencia: 'Transferencia', financiado_propio: 'Financiación propia',
    financiado_externo: 'Financiación externa', canje_mas_diferencia: 'Canje + diferencia', mixto: 'Mixto',
};

export const ESTADO_ENTREGA_LABEL: Record<EstadoEntrega, { label: string; tone: BadgeTone }> = {
    pendiente: { label: 'Entrega pendiente', tone: 'warning' },
    bloqueada: { label: 'Bloqueada', tone: 'danger' },
    autorizada: { label: 'Autorizada', tone: 'cyan' },
    entregada: { label: 'Entregada', tone: 'success' },
    cancelada: { label: 'Cancelada', tone: 'muted' },
};
