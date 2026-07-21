import apiClient from './client';

export interface Financiera {
    id: number;
    concesionariaId: number;
    nombre: string;
    tipo: 'financiera' | 'banco' | 'otra';
    contacto?: string;
    telefono?: string;
    email?: string;
    activo: boolean;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string;
}

export interface CreateFinancieraDto {
    nombre: string;
    tipo?: 'financiera' | 'banco' | 'otra';
    contacto?: string;
    telefono?: string;
    email?: string;
    activo?: boolean;
}

export interface UpdateFinancieraDto {
    nombre?: string;
    tipo?: 'financiera' | 'banco' | 'otra';
    contacto?: string;
    telefono?: string;
    email?: string;
    activo?: boolean;
}

const financierasApi = {
    getAll: (params?: Record<string, unknown>) =>
        apiClient.get('/financieras', { params }),

    getById: (id: number) =>
        apiClient.get(`/financieras/${id}`),

    create: (data: CreateFinancieraDto) =>
        apiClient.post('/financieras', data),

    update: (id: number, data: UpdateFinancieraDto) =>
        apiClient.patch(`/financieras/${id}`, data),

    delete: (id: number) =>
        apiClient.delete(`/financieras/${id}`),
};

export default financierasApi;
