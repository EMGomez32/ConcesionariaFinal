import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { postventaApi, type CreateCasoDto, type CreateItemDto } from '../api/postventa.api';

export const postventaKeys = {
    all: ['postventa'] as const,
    casos: () => [...postventaKeys.all, 'casos'] as const,
    caso: (id: number) => [...postventaKeys.casos(), id] as const,
};

export const usePostventaCasos = (filters: Record<string, unknown> = {}) => {
    return useQuery({
        queryKey: [...postventaKeys.casos(), filters],
        queryFn: async () => {
            const res = await postventaApi.getCasos(filters);
            return res;
        },
    });
};

export const usePostventaCaso = (id: number) => {
    return useQuery({
        queryKey: postventaKeys.caso(id),
        queryFn: async () => {
            const res = await postventaApi.getCasoById(id);
            return res;
        },
        enabled: !!id,
    });
};

export const useCreatePostventaCaso = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: CreateCasoDto) => postventaApi.createCaso(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: postventaKeys.casos() });
        },
    });
};

export const useCreatePostventaItem = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: CreateItemDto) => postventaApi.createItem(data),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: postventaKeys.caso(variables.casoId) });
        },
    });
};
