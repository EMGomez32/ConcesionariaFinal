import client from './client';

export interface GastoFijoCategoria {
    id: number;
    nombre: string;
    activo?: boolean;
    concesionariaId?: number;
    createdAt?: string;
}

export const gastosFijosCategoriaApi = {
    getAll: (params?: Record<string, unknown>) =>
        client.get('/gastos-fijos-categorias', { params }),
    create: (data: { nombre: string; activo?: boolean }) =>
        client.post('/gastos-fijos-categorias', data),
    update: (id: number, data: { nombre?: string; activo?: boolean }) =>
        client.patch(`/gastos-fijos-categorias/${id}`, data),
    delete: (id: number) =>
        client.delete(`/gastos-fijos-categorias/${id}`),
};
