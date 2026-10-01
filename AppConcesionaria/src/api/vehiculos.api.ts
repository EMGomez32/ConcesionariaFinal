import { api } from './client';
import { Importe } from './atenciones.api';

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
}

interface Paginado<T> { results: T[]; page: number; limit: number; totalPages: number; totalResults: number }

export const vehiculosApi = {
    list: (params: { search?: string; estado?: EstadoVehiculo | EstadoVehiculo[] }, page = 1, limit = 30) => {
        const { estado, ...rest } = params;
        const query: Record<string, unknown> = { ...rest, page, limit };
        if (estado) query.estado = Array.isArray(estado) ? estado.join(',') : estado;
        return api.get('/vehiculos', { params: query }).then((r) => r.data as Paginado<Vehiculo>);
    },
    getById: (id: number) => api.get(`/vehiculos/${id}`).then((r) => r.data as Vehiculo),
};

export const ESTADO_VEHICULO_LABEL: Record<EstadoVehiculo, string> = {
    preparacion: 'En preparación',
    publicado: 'Publicado',
    reservado: 'Reservado',
    vendido: 'Vendido',
    devuelto: 'Devuelto',
};
