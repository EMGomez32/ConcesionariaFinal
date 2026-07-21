import apiClient from './client';

export type EstadoSolicitud = 'borrador' | 'enviada' | 'pendiente' | 'aprobada' | 'rechazada' | 'cancelada';

export interface SolicitudFinanciacion {
    id: number;
    concesionariaId: number;
    sucursalId?: number;
    ventaId?: number;
    presupuestoId?: number;
    vehiculoId?: number | null;
    clienteId: number;
    financieraId: number;
    estado: EstadoSolicitud;
    // Decimal en la base; el repo los convierte a number antes de responder.
    montoSolicitado?: number | null;
    plazoCuotas?: number | null;
    tasaEstimada?: number | null;
    fechaEnvio?: string | null;
    fechaRespuesta?: string | null;
    montoAprobado?: number | null;
    tasaFinal?: number | null;
    observaciones?: string | null;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string;
    cliente?: { id: number; nombre: string; dni?: string };
    financiera?: { id: number; nombre: string; tipo: string };
    vehiculo?: VehiculoDeSolicitud;
    archivos?: SolicitudArchivo[];
}

/** Lo que el backend selecciona del vehículo para esta pantalla. */
export interface VehiculoDeSolicitud {
    id: number;
    marca: string;
    modelo: string;
    version?: string | null;
    anio?: number | null;
    dominio?: string | null;
    estado: string;
}

export interface SolicitudArchivo {
    id: number;
    solicitudId: number;
    tipo?: string | null;
    url: string;
    descripcion?: string | null;
    originalName?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    storageKey?: string | null;
    uploadedById?: number | null;
    createdAt: string;
}

export interface CreateSolicitudDto {
    clienteId: number;
    financieraId: number;
    /** Opcional: en una pre-aprobación todavía no hay auto elegido. */
    vehiculoId?: number;
    ventaId?: number;
    presupuestoId?: number;
    sucursalId?: number;
    montoSolicitado?: number;
    plazoCuotas?: number;
    tasaEstimada?: number;
    observaciones?: string;
}

export interface UpdateSolicitudDto {
    estado?: EstadoSolicitud;
    montoAprobado?: number;
    tasaFinal?: number;
    fechaEnvio?: string;
    fechaRespuesta?: string;
    observaciones?: string;
}

const solicitudesFinanciacionApi = {
    getAll: (params?: Record<string, unknown>, pagination?: { limit?: number; page?: number }) =>
        apiClient.get('/financiacion-solicitudes', { params: { ...params, ...pagination } }),

    getById: (id: number) =>
        apiClient.get(`/financiacion-solicitudes/${id}`),

    create: (data: CreateSolicitudDto) =>
        apiClient.post('/financiacion-solicitudes', data),

    update: (id: number, data: UpdateSolicitudDto) =>
        apiClient.patch(`/financiacion-solicitudes/${id}`, data),

    delete: (id: number) =>
        apiClient.delete(`/financiacion-solicitudes/${id}`),

    // Archivos adjuntos
    listArchivos: (solicitudId: number) =>
        apiClient.get<SolicitudArchivo[]>(`/financiacion-solicitudes/${solicitudId}/archivos`),

    deleteArchivo: (solicitudId: number, archivoId: number) =>
        apiClient.delete(`/financiacion-solicitudes/${solicitudId}/archivos/${archivoId}`),

    /** Endpoint multipart usado por el componente <FileUploader>. */
    uploadEndpoint: (solicitudId: number) => `/financiacion-solicitudes/${solicitudId}/archivos/upload`,
};

export default solicitudesFinanciacionApi;
