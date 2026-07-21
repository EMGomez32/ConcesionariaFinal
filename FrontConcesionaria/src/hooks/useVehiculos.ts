import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vehiculosApi } from '../api/vehiculos.api';
import type { Vehiculo, VehiculoFilter, PaginationOptions, EstadoVehiculo } from '../types/vehiculo.types';
import type { PaginatedResponse } from '../types/api.types';

export const vehiculosKeys = {
    all: ['vehiculos'] as const,
    lists: () => [...vehiculosKeys.all, 'list'] as const,
    list: (filters: VehiculoFilter, options: PaginationOptions) => [...vehiculosKeys.lists(), { filters, options }] as const,
    details: () => [...vehiculosKeys.all, 'detail'] as const,
    detail: (id: number) => [...vehiculosKeys.details(), id] as const,
};

export const useVehiculos = (filters: VehiculoFilter = {}, options: PaginationOptions = {}) => {
    return useQuery<PaginatedResponse<Vehiculo>>({
        queryKey: vehiculosKeys.list(filters, options),
        queryFn: async () => {
            const res = await vehiculosApi.getAll(filters, options);
            return res;
        },
    });
};

export const useVehiculo = (id: number) => {
    return useQuery<Vehiculo>({
        queryKey: vehiculosKeys.detail(id),
        queryFn: async () => {
            const res = await vehiculosApi.getById(id);
            return res;
        },
        enabled: !!id,
    });
};

export const useChangeVehiculoEstado = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, estado }: { id: number; estado: EstadoVehiculo }) =>
            vehiculosApi.changeEstado(id, estado),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: vehiculosKeys.lists() });
        },
    });
};

export const useDeleteVehiculo = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => vehiculosApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: vehiculosKeys.lists() });
        },
    });
};

export const useTransferVehiculo = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, sucursalId, motivo }: { id: number; sucursalId: number; motivo?: string }) =>
            vehiculosApi.transferir(id, sucursalId, motivo),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: vehiculosKeys.lists() });
        },
    });
};
