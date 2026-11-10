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

    // `currentPassword` es la contraseña de QUIEN hace el reset (step-up): el backend no
    // deja tomar la cuenta de otro con una sesión abierta sola.
    resetPassword: (id: number, password: string, currentPassword: string) => {
        return client.post(`/usuarios/${id}/reset-password`, { password, currentPassword });
    },

    // Autogestión: el usuario logueado sobre su propia cuenta (Configuración).
    // `currentPassword` es obligatoria SÓLO si cambia el email. Cambiar el email o la
    // contraseña cierra las DEMÁS sesiones; la de este navegador la reconoce el backend
    // por el access token (su `sid`) y le rota la cookie: no hace falta mandar el refresh
    // (que la web ya ni tiene).
    updateMe: (data: { nombre?: string; email?: string; currentPassword?: string }) => {
        return client.patch('/usuarios/me', data);
    },

    changeMyPassword: (currentPassword: string, newPassword: string) => {
        return client.post('/usuarios/me/password', { currentPassword, newPassword });
    },
};
