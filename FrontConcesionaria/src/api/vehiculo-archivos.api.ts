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
    /** Foto principal del vehículo (la que usa la ficha PDF y los listados). */
    esPrincipal?: boolean;
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

    /** Marca una foto como la principal del vehículo (desmarca las otras). */
    setPrincipal: (id: number) =>
        client.patch<VehiculoArchivo>(`/vehiculo-archivos/${id}/principal`),

    /** Endpoint multipart usado por el componente <FileUploader>. */
    uploadEndpoint: '/vehiculo-archivos/upload',
};
