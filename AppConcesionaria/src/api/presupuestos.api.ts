import { api } from './client';
import { Importe } from './atenciones.api';
import type { BadgeTone } from '../components/ui';

/** API de Presupuestos (cotizaciones) para el vendedor. Lista + detalle. */

export type EstadoPresupuesto = 'borrador' | 'enviado' | 'aceptado' | 'rechazado' | 'vencido' | 'cancelado';

export interface PresupuestoItem {
    id: number;
    vehiculoId?: number | null;
    vehiculo?: { marca: string; modelo: string; dominio?: string | null } | null;
    precioLista: Importe;
    descuento?: Importe;
    precioFinal: Importe;
}
export interface PresupuestoExtra { id?: number; descripcion?: string | null; monto: Importe }
export interface PresupuestoCanje {
    descripcion?: string | null; anio?: number | null; km?: number | null;
    dominio?: string | null; valorTomado: Importe;
}

export interface Presupuesto {
    id: number;
    nroPresupuesto: string;
    clienteId: number;
    fechaCreacion: string;
    validoHasta?: string | null;
    estado: EstadoPresupuesto;
    moneda: string;
    total?: Importe;
    observaciones?: string | null;
    cliente?: { nombre: string; telefono?: string | null } | null;
    vendedor?: { nombre: string } | null;
    items?: PresupuestoItem[];
    extras?: PresupuestoExtra[];
    canje?: PresupuestoCanje | null;
}

interface Paginado<T> { results: T[]; page: number; limit: number; totalPages: number; totalResults: number }

export interface CreatePresupuestoDto {
    sucursalId: number;
    clienteId: number;
    vendedorId: number;
    moneda: 'ARS' | 'USD';
    fechaCreacion: string;
    validoHasta?: string | null;
    observaciones?: string | null;
    items?: { vehiculoId: number; precioLista: number; descuento?: number; precioFinal: number }[];
}

export const presupuestosApi = {
    list: (search?: string, page = 1, limit = 30) =>
        api.get('/presupuestos', { params: { ...(search ? { search } : {}), page, limit } })
            .then((r) => r.data as Paginado<Presupuesto>),
    getById: (id: number) => api.get(`/presupuestos/${id}`).then((r) => r.data as Presupuesto),
    create: (data: CreatePresupuestoDto) => api.post('/presupuestos', data).then((r) => r.data as Presupuesto),
};

export const ESTADO_PRESUPUESTO_LABEL: Record<EstadoPresupuesto, { label: string; tone: BadgeTone }> = {
    borrador: { label: 'Borrador', tone: 'muted' },
    enviado: { label: 'Enviado', tone: 'cyan' },
    aceptado: { label: 'Aceptado', tone: 'success' },
    rechazado: { label: 'Rechazado', tone: 'danger' },
    vencido: { label: 'Vencido', tone: 'warning' },
    cancelado: { label: 'Cancelado', tone: 'muted' },
};
