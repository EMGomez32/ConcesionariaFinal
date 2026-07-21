import { useQuery } from '@tanstack/react-query';
import { sucursalesApi } from '../api/sucursales.api';
import type { Sucursal } from '../types/sucursal.types';

import type { SucursalFilter } from '../types/sucursal.types';
import type { PaginationOptions } from '../types/vehiculo.types';

export const sucursalesKeys = {
    all: ['sucursales'] as const,
    lists: () => [...sucursalesKeys.all, 'list'] as const,
    list: (filters: SucursalFilter, options: PaginationOptions) => [...sucursalesKeys.lists(), { filters, options }] as const,
};

export const useSucursales = (filters: SucursalFilter = {}, options: PaginationOptions = {}) => {
    return useQuery<Sucursal[]>({
        queryKey: sucursalesKeys.list(filters, options),
        queryFn: async () => {
            // /sucursales devuelve { success, data: [...] }; otros listados
            // devuelven { results }. Se cubren todas las formas.
            const res = await sucursalesApi.getAll(filters, options) as unknown;
            if (Array.isArray(res)) return res as Sucursal[];
            const o = (res ?? {}) as { results?: Sucursal[]; data?: Sucursal[] | { results?: Sucursal[] } };
            if (Array.isArray(o.results)) return o.results;
            if (Array.isArray(o.data)) return o.data;
            const dr = (o.data as { results?: Sucursal[] })?.results;
            return Array.isArray(dr) ? dr : [];
        },
    });
};
