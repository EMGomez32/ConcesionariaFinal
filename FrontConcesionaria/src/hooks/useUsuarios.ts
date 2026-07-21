import { useQuery } from '@tanstack/react-query';
import { usuariosApi } from '../api/usuarios.api';
import type { Usuario, UsuarioFilter } from '../types/usuario.types';
import type { PaginationOptions } from '../types/vehiculo.types';
import type { PaginatedResponse } from '../types/api.types';

export const USUARIOS_KEYS = {
    all: ['usuarios'] as const,
    list: (filters: UsuarioFilter, options: PaginationOptions) => [...USUARIOS_KEYS.all, 'list', { ...filters, ...options }] as const,
};

export const useUsuarios = (filters: UsuarioFilter = {}, options: PaginationOptions = {}) => {
    return useQuery<PaginatedResponse<Usuario>>({
        queryKey: USUARIOS_KEYS.list(filters, options),
        queryFn: async () => {
            const res = await usuariosApi.getAll(filters, options);
            return res as PaginatedResponse<Usuario>;
        },
    });
};
