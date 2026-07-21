import client from './client';

export type EstadoReserva = 'activa' | 'convertida_en_venta' | 'cancelada' | 'vencida';
export type MonedaReserva = 'ARS' | 'USD';

export interface Reserva {
    id: number;
    sucursalId: number;
    vendedorId: number;
    clienteId: number;
    vehiculoId: number;
    concesionariaId?: number;
    monto: number;
    moneda: MonedaReserva;
    fechaVencimiento: string;
    observaciones?: string;
    estado: EstadoReserva;
    createdAt?: string;
    updatedAt?: string;
    cliente?: { id: number; nombre: string; dni?: string; telefono?: string };
    vehiculo?: { id: number; marca: string; modelo: string; dominio?: string; version?: string };
    sucursal?: { id: number; nombre: string };
    creadaPor?: { nombre: string; email: string };
}

export interface ReservaFilter {
    estado?: EstadoReserva;
    clienteId?: number;
    vehiculoId?: number;
    sucursalId?: number;
    page?: number;
    limit?: number;
}

export const reservasApi = {
    getAll: (filters: ReservaFilter = {}) =>
        client.get('/reservas', { params: filters }),

    getById: (id: number) =>
        client.get(`/reservas/${id}`),

    create: (data: {
        sucursalId: number;
        vendedorId: number;
        clienteId: number;
        vehiculoId: number;
        monto: number;
        moneda: MonedaReserva;
        fechaVencimiento: string;
        observaciones?: string;
    }) => client.post('/reservas', data),

    update: (id: number, data: {
        estado?: EstadoReserva;
        monto?: number;
        fechaVencimiento?: string;
        observaciones?: string;
    }) => client.patch(`/reservas/${id}`, data),

    delete: (id: number) =>
        client.delete(`/reservas/${id}`),
};
