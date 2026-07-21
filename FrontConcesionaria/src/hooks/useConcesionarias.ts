import { useQuery } from '@tanstack/react-query';
import { concesionariasApi } from '../api/concesionarias.api';
import type { Concesionaria, ConcesionariaFilter } from '../types/concesionaria.types';
import type { PaginationOptions } from '../types/vehiculo.types';
import type { PaginatedResponse } from '../types/api.types';

export const concesionariasKeys = {
    all: ['concesionarias'] as const,
    lists: () => [...concesionariasKeys.all, 'list'] as const,
    list: (filters: ConcesionariaFilter, options: PaginationOptions) => [...concesionariasKeys.lists(), { filters, options }] as const,
};

export const useConcesionarias = (filters: ConcesionariaFilter = {}, options: PaginationOptions = {}) => {
    return useQuery<PaginatedResponse<Concesionaria>>({
        queryKey: concesionariasKeys.list(filters, options),
        queryFn: async () => {
            const res = await concesionariasApi.getAll(filters, options);
            return res as PaginatedResponse<Concesionaria>;
        },
        staleTime: 30000, // Consider data fresh for 30 seconds
        refetchOnMount: true,
        refetchOnWindowFocus: false,
    });
};
