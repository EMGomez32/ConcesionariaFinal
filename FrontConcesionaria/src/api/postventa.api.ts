import apiClient from './client';

export type EstadoPostventa = 'pendiente' | 'en_curso' | 'resuelto';

/** Tipo de reclamo del catálogo (ABM en la pestaña "Tipos de Caso"). */
export interface TipoPostventa {
    id: number;
    concesionariaId: number;
    nombre: string;
    /** Archivado: no se ofrece al crear casos, pero los viejos lo siguen mostrando. */
    activo: boolean;
    createdAt: string;
    updatedAt: string;
    /** Cuántos casos lo usan. Sólo viene en el listado del ABM. */
    casosCount?: number;
}

export interface PostventaCaso {
    id: number;
    concesionariaId: number;
    sucursalId: number;
    ventaId: number;
    vehiculoId: number;
    clienteId: number;
    fechaReclamo: string;
    tipoId?: number | null;
    /** Nombre del tipo ya resuelto por el backend (catálogo, o el texto viejo si es un caso histórico). */
    tipo?: string | null;
    tipoRef?: { id: number; nombre: string; activo: boolean } | null;
    descripcion: string;
    estado: EstadoPostventa;
    fechaCierre?: string;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string;
    cliente?: { id: number; nombre: string };
    vehiculo?: { id: number; marca: string; modelo: string; dominio?: string };
    sucursal?: { id: number; nombre: string };
    items?: PostventaItem[];
}

export interface PostventaItem {
    id: number;
    casoId: number;
    proveedorId?: number;
    fecha: string;
    descripcion: string;
    monto: string;
    comprobanteUrl?: string;
    createdAt: string;
    proveedor?: { id: number; nombre: string };
}

export interface CreateCasoDto {
    clienteId: number;
    vehiculoId: number;
    sucursalId: number;
    ventaId: number;
    fechaReclamo: string;
    tipoId?: number;
    descripcion: string;
}

export interface UpdateCasoDto {
    estado?: EstadoPostventa;
    tipoId?: number | null;
    descripcion?: string;
    fechaReclamo?: string;
    fechaCierre?: string;
}

export interface CreateItemDto {
    casoId: number;
    proveedorId?: number;
    fecha: string;
    descripcion: string;
    monto: number;
    comprobanteUrl?: string;
}

export const postventaApi = {
    // Casos
    getCasos: (params?: Record<string, unknown>) =>
        apiClient.get('/postventa-casos', { params }),

    getCasoById: (id: number) =>
        apiClient.get(`/postventa-casos/${id}`),

    createCaso: (data: CreateCasoDto) =>
        apiClient.post('/postventa-casos', data),

    updateCaso: (id: number, data: UpdateCasoDto) =>
        apiClient.patch(`/postventa-casos/${id}`, data),

    deleteCaso: (id: number) =>
        apiClient.delete(`/postventa-casos/${id}`),

    // Items
    getItemsByCaso: (casoId: number) =>
        apiClient.get(`/postventa-items/caso/${casoId}`),

    createItem: (data: CreateItemDto) =>
        apiClient.post('/postventa-items', data),

    deleteItem: (id: number) =>
        apiClient.delete(`/postventa-items/${id}`),

    // Tipos de caso (catálogo)
    getTipos: () =>
        apiClient.get('/postventa-tipos'),

    createTipo: (data: { nombre: string; activo?: boolean }) =>
        apiClient.post('/postventa-tipos', data),

    updateTipo: (id: number, data: { nombre?: string; activo?: boolean }) =>
        apiClient.patch(`/postventa-tipos/${id}`, data),

    deleteTipo: (id: number) =>
        apiClient.delete(`/postventa-tipos/${id}`),
};
