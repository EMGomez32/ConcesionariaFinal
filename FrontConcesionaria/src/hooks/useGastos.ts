import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gastosApi, type GastoFilter } from '../api/gastos.api';
import { gastosCategoriaApi } from '../api/gastos-categorias.api';

export const GASTOS_KEYS = {
    all: ['gastos'] as const,
    list: (filters: GastoFilter) => [...GASTOS_KEYS.all, 'list', filters] as const,
    categorias: ['gastos-categorias'] as const,
};

export const useGastos = (filters: GastoFilter) => {
    return useQuery({
        queryKey: GASTOS_KEYS.list(filters),
        queryFn: async () => {
            const res = await gastosApi.getAll(filters);
            return res;
        },
    });
};

export const useGastosCategorias = () => {
    return useQuery({
        queryKey: GASTOS_KEYS.categorias,
        queryFn: async () => {
            const res = await gastosCategoriaApi.getAll();
            if (Array.isArray(res)) return res;
            return res.results ?? [];
        },
    });
};

export const useCreateGasto = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: Parameters<typeof gastosApi.create>[0]) =>
            gastosApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: GASTOS_KEYS.all });
        },
    });
};

export const useUpdateGasto = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: { monto?: number; descripcion?: string; fechaGasto?: string } }) =>
            gastosApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: GASTOS_KEYS.all });
        },
    });
};

export const useDeleteGasto = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => gastosApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: GASTOS_KEYS.all });
        },
    });
};

export const useCreateCategoriaGasto = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: { nombre: string; descripcion?: string }) => gastosCategoriaApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: GASTOS_KEYS.categorias });
        },
    });
};

export const useUpdateCategoriaGasto = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: { nombre?: string; descripcion?: string } }) =>
            gastosCategoriaApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: GASTOS_KEYS.categorias });
        },
    });
};

export const useDeleteCategoriaGasto = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => gastosCategoriaApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: GASTOS_KEYS.categorias });
        },
    });
};
