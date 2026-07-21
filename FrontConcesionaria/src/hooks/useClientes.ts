import { useQuery } from '@tanstack/react-query';
import { clientesApi } from '../api/clientes.api';
import type { Cliente, ClienteFilter } from '../types/cliente.types';
import type { PaginationOptions } from '../types/vehiculo.types';
import type { PaginatedResponse } from '../types/api.types';

export const CLIENTES_KEYS = {
    all: ['clientes'] as const,
    list: (filters: ClienteFilter, options: PaginationOptions) => [...CLIENTES_KEYS.all, 'list', { ...filters, ...options }] as const,
};

export const useClientes = (filters: ClienteFilter = {}, options: PaginationOptions = {}) => {
    return useQuery<PaginatedResponse<Cliente>>({
        queryKey: CLIENTES_KEYS.list(filters, options),
        queryFn: async () => {
            const res = await clientesApi.getAll(filters, options);
            return res;
        },
    });
};
