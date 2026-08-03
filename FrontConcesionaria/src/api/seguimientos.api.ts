import client from './client';

export type TipoSeguimiento = 'llamada' | 'whatsapp' | 'email' | 'visita' | 'otro';

/** Un contacto de la bitácora de seguimiento del cliente (CRM). */
export interface Seguimiento {
    id: number;
    clienteId: number;
    usuarioId: number;
    tipo: TipoSeguimiento;
    fecha: string;
    nota: string;
    /** Fecha del próximo contacto a coordinar (o null). */
    proximoContacto?: string | null;
    createdAt: string;
    usuario?: { id: number; nombre: string };
}

export interface CreateSeguimientoDto {
    clienteId: number;
    tipo: TipoSeguimiento;
    fecha: string;
    nota: string;
    proximoContacto?: string | null;
}

export const seguimientosApi = {
    /** Bitácora de un cliente (más reciente primero). */
    getByCliente: (clienteId: number) =>
        client.get<Seguimiento[]>(`/cliente-seguimientos/cliente/${clienteId}`),

    /** Registra un contacto (el autor lo estampa el backend desde el token). */
    create: (data: CreateSeguimientoDto) =>
        client.post<Seguimiento>('/cliente-seguimientos', data),

    delete: (id: number) =>
        client.delete(`/cliente-seguimientos/${id}`),
};
