import client from './client';

/** Interés de un cliente en un vehículo del stock (puente CRM↔inventario). */
export interface VehiculoInteres {
    id: number;
    clienteId: number;
    vehiculoId: number;
    nota?: string | null;
    createdAt: string;
    cliente?: { id: number; nombre: string; telefono?: string | null; estadoLead?: string };
    vehiculo?: {
        id: number; marca: string; modelo: string; version?: string | null;
        anio?: number | null; dominio?: string | null; estado: string;
        precioLista?: number | null; moneda?: string;
    };
}

export interface CreateInteresDto {
    clienteId: number;
    vehiculoId: number;
    nota?: string;
}

export const vehiculoInteresApi = {
    /** Vehículos que le interesan a un cliente. */
    getByCliente: (clienteId: number) =>
        client.get<VehiculoInteres[]>(`/vehiculo-intereses/cliente/${clienteId}`),

    /** Clientes interesados en un vehículo. */
    getByVehiculo: (vehiculoId: number) =>
        client.get<VehiculoInteres[]>(`/vehiculo-intereses/vehiculo/${vehiculoId}`),

    /** Marca el interés (idempotente: si ya existe, actualiza la nota). */
    create: (data: CreateInteresDto) =>
        client.post<VehiculoInteres>('/vehiculo-intereses', data),

    delete: (id: number) =>
        client.delete(`/vehiculo-intereses/${id}`),
};
