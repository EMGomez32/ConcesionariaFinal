import client from './client';
import type { UsuarioFilter, CreateUsuarioDto, UpdateUsuarioDto } from '../types/usuario.types';
import type { PaginationOptions } from '../types/vehiculo.types';

export const usuariosApi = {
    getAll: (filters: UsuarioFilter = {}, options: PaginationOptions = {}) => {
        return client.get('/usuarios', {
            params: { ...filters, ...options },
        });
    },

    getById: (id: number) => {
        return client.get(`/usuarios/${id}`);
    },

    create: (data: CreateUsuarioDto) => {
        return client.post('/usuarios', data);
    },

    update: (id: number, data: UpdateUsuarioDto) => {
        return client.patch(`/usuarios/${id}`, data);
    },

    delete: (id: number) => {
        return client.delete(`/usuarios/${id}`);
    },

    resetPassword: (id: number, password: string) => {
        return client.post(`/usuarios/${id}/reset-password`, { password });
    },

    // Autogestión: el usuario logueado sobre su propia cuenta (Configuración).
    updateMe: (data: { nombre?: string; email?: string }) => {
        return client.patch('/usuarios/me', data);
    },

    changeMyPassword: (currentPassword: string, newPassword: string) => {
        return client.post('/usuarios/me/password', { currentPassword, newPassword });
    },
};
