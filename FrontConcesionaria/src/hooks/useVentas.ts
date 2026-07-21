import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ventasApi, type CreateVentaDto, type VentaFilters } from '../api/ventas.api';
import type { PaginationOptions } from '../types/vehiculo.types';

export const VENTAS_KEYS = {
    all: ['ventas'] as const,
    list: (filters: VentaFilters, options: PaginationOptions) => [...VENTAS_KEYS.all, 'list', { ...filters, ...options }] as const,
    detail: (id: number) => [...VENTAS_KEYS.all, 'detail', id] as const,
};

export const useVentas = (filters: VentaFilters = {}, options: PaginationOptions = {}) => {
    return useQuery({
        queryKey: VENTAS_KEYS.list(filters, options),
        queryFn: async () => {
            const res = await ventasApi.getAll(filters, options);
            return res;
        },
    });
};

export const useVenta = (id: number | null) => {
    return useQuery({
        queryKey: VENTAS_KEYS.detail(id!),
        queryFn: async () => {
            const res = await ventasApi.getById(id!);
            return res;
        },
        enabled: !!id,
    });
};

export const useCreateVenta = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: CreateVentaDto) => ventasApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: VENTAS_KEYS.all });
            queryClient.invalidateQueries({ queryKey: ['vehiculos'] }); // Invalidate vehiculos as status changes
        },
    });
};

export const useUpdateVenta = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: { estadoEntrega?: string; observaciones?: string } }) =>
            ventasApi.update(id, data),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: VENTAS_KEYS.all });
            queryClient.invalidateQueries({ queryKey: VENTAS_KEYS.detail(id) });
        },
    });
};

export const useDeleteVenta = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => ventasApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: VENTAS_KEYS.all });
            queryClient.invalidateQueries({ queryKey: ['vehiculos'] });
        },
    });
};
