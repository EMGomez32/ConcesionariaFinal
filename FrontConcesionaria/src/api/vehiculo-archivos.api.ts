import client from './client';

export interface VehiculoArchivo {
    id: number;
    vehiculoId: number;
    url: string;
    tipo?: string | null;
    descripcion?: string | null;
    originalName?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    storageKey?: string | null;
    uploadedById?: number | null;
    createdAt?: string;
    updatedAt?: string;
}

/** Legacy: registrar un archivo apuntando a una URL externa ya conocida. */
export interface CreateArchivoDto {
    vehiculoId: number;
    url: string;
    tipo?: string;
    descripcion?: string;
}

export const vehiculoArchivosApi = {
    getByVehiculo: (vehiculoId: number) =>
        client.get<VehiculoArchivo[]>(`/vehiculo-archivos/vehiculo/${vehiculoId}`),

    create: (data: CreateArchivoDto) =>
        client.post<VehiculoArchivo>('/vehiculo-archivos', data),

    delete: (id: number) =>
        client.delete(`/vehiculo-archivos/${id}`),

    /** Endpoint multipart usado por el componente <FileUploader>. */
    uploadEndpoint: '/vehiculo-archivos/upload',
};
