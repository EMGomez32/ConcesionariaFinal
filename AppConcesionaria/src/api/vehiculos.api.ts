import { api } from './client';
import { Paginado } from '../lib/paginacion';
import type { BadgeTone } from '../components/ui';
import { Importe } from './atenciones.api';
import { API_BASE_URL } from '../config';
import { urlArchivo } from '../lib/urls';

/**
 * API de Vehículos (stock) para el vendedor. El backend NO manda campos de costo
 * en la proyección del vendedor (sin precioCompra ni márgenes): acá sólo tipamos
 * lo que se muestra en el salón.
 */

export type EstadoVehiculo = 'preparacion' | 'publicado' | 'reservado' | 'vendido' | 'devuelto';

export interface Vehiculo {
    id: number;
    marca: string;
    modelo: string;
    version?: string | null;
    anio?: number | null;
    dominio?: string | null;
    kmIngreso?: number | null;
    color?: string | null;
    estado: EstadoVehiculo;
    tipo?: string;
    precioLista?: Importe;
    moneda?: 'ARS' | 'USD' | string;
    fechaIngreso?: string | null;
    sucursal?: { id: number; nombre: string } | null;
    /** Fotos y documentos (el listado y el detalle los traen). */
    archivos?: VehiculoArchivo[];
}

export interface VehiculoArchivo {
    id: number;
    url: string;
    tipo?: string | null;
    mimeType?: string | null;
    descripcion?: string | null;
    /** La foto de portada (la de la ficha PDF y los listados). */
    esPrincipal?: boolean;
}


export const vehiculosApi = {
    list: (params: { search?: string; estado?: EstadoVehiculo | EstadoVehiculo[] }, page = 1, limit = 30) => {
        const { estado, ...rest } = params;
        const query: Record<string, unknown> = { ...rest, page, limit };
        if (estado) query.estado = Array.isArray(estado) ? estado.join(',') : estado;
        return api.get('/vehiculos', { params: query }).then((r) => r.data as Paginado<Vehiculo>);
    },
    getById: (id: number) => api.get(`/vehiculos/${id}`).then((r) => r.data as Vehiculo),
};

/**
 * Unidades que se pueden presupuestar o vender: todo menos lo vendido o devuelto
 * (el selector no ofrece una unidad que ya no está).
 */
export const ESTADOS_OFRECIBLES: EstadoVehiculo[] = ['publicado', 'reservado', 'preparacion'];

/**
 * URLs absolutas de las fotos de una unidad, con la de portada primero. Mismo
 * criterio que la web (ComparadorPage): sin `tipo` es foto. Las URLs son las que
 * guarda el backend ("/uploads/…", estáticas, sin firma) resueltas contra su origen.
 */
export const fotosDeUnidad = (v: Pick<Vehiculo, 'archivos'>): string[] => {
    const fotos = (v.archivos ?? []).filter((a) =>
        (a.tipo ?? 'foto') === 'foto' && (!a.mimeType || a.mimeType.startsWith('image/')));
    const ordenadas = [...fotos.filter((f) => f.esPrincipal), ...fotos.filter((f) => !f.esPrincipal)];
    return ordenadas.map((f) => urlArchivo(f.url, API_BASE_URL)).filter((u): u is string => !!u);
};

export const ESTADO_VEHICULO_TONE: Record<EstadoVehiculo, BadgeTone> = {
    publicado: 'success', reservado: 'warning', preparacion: 'cyan', vendido: 'muted', devuelto: 'danger',
};

export const ESTADO_VEHICULO_LABEL: Record<EstadoVehiculo, string> = {
    preparacion: 'En preparación',
    publicado: 'Publicado',
    reservado: 'Reservado',
    vendido: 'Vendido',
    devuelto: 'Devuelto',
};

/** Lo que el alta de presupuesto/venta precarga al elegir una unidad. */
export interface DatosUnidad { precioLista: number | null; moneda: 'ARS' | 'USD' }

/** Una unidad como opción de selector (con su precio de lista y moneda para precargar). */
export const unidadAOpcion = (v: {
    id: number; marca: string; modelo: string; anio?: number | null; dominio?: string | null;
    precioLista?: Importe; moneda?: string | null;
}) => {
    const n = v.precioLista === null || v.precioLista === undefined || v.precioLista === '' ? null : Number(v.precioLista);
    return {
        id: v.id,
        label: [v.marca, v.modelo, v.anio].filter(Boolean).join(' '),
        sub: v.dominio ?? undefined,
        data: { precioLista: n != null && Number.isFinite(n) ? n : null, moneda: v.moneda === 'USD' ? 'USD' : 'ARS' } as DatosUnidad,
    };
};

export const TIPO_VEHICULO_LABEL: Record<string, string> = { USADO: 'Usado', CERO_KM: '0 km' };
