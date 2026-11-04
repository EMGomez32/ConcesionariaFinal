import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { ventasApi, type CreateVentaDto, type VentaFilters } from '../api/ventas.api';
import type { PaginationOptions } from '../types/vehiculo.types';
import type { EstadoEntrega } from '../types/venta.types';

export const VENTAS_KEYS = {
    all: ['ventas'] as const,
    list: (filters: VentaFilters, options: PaginationOptions) => [...VENTAS_KEYS.all, 'list', { ...filters, ...options }] as const,
    detail: (id: number) => [...VENTAS_KEYS.all, 'detail', id] as const,
    conteo: (filters: VentaFilters) => [...VENTAS_KEYS.all, 'conteo', filters] as const,
};

export const useVentas = (filters: VentaFilters = {}, options: PaginationOptions = {}) => {
    return useQuery({
        queryKey: VENTAS_KEYS.list(filters, options),
        queryFn: async () => {
            const res = await ventasApi.getAll(filters, options);
            return res;
        },
        // Al cambiar de página o de búsqueda la tabla conserva las filas
        // anteriores hasta que llegan las nuevas, en vez de parpadear vacía.
        placeholderData: keepPreviousData,
    });
};

/**
 * Cantidad de ventas que cumplen un filtro, contada por el backend
 * (`totalResults` con limit=1). Los indicadores de la pantalla se calculan así
 * y no sobre la página visible: "Ventas del mes" contaba las 15 filas de la
 * página actual.
 */
export const useVentasConteo = (filters: VentaFilters, enabled = true) => {
    return useQuery({
        queryKey: VENTAS_KEYS.conteo(filters),
        queryFn: async () => {
            const res = await ventasApi.getAll(filters, { page: 1, limit: 1 });
            return res?.totalResults ?? 0;
        },
        enabled,
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
        mutationFn: ({ id, data }: { id: number; data: { observaciones?: string } }) =>
            ventasApi.update(id, data),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: VENTAS_KEYS.all });
            queryClient.invalidateQueries({ queryKey: VENTAS_KEYS.detail(id) });
        },
    });
};

// Cambio de estado de logística contra el endpoint dedicado, que valida la
// transición en el backend (state machine ventaEntrega) y setea fechaEntrega
// al pasar a 'entregada'.
export const useChangeEstadoEntrega = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, estadoEntrega }: { id: number; estadoEntrega: EstadoEntrega }) =>
            ventasApi.changeEstadoEntrega(id, estadoEntrega),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: VENTAS_KEYS.all });
            queryClient.invalidateQueries({ queryKey: VENTAS_KEYS.detail(id) });
        },
    });
};

/**
 * "Anular venta" por estado de entrega (`cancelada`, terminal, sólo admin). Hook
 * aparte del de avanzar la entrega porque pide motivo y su error lo muestra el
 * diálogo del motivo, no el toast global.
 */
export const useAnularOperacionVenta = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
            ventasApi.changeEstadoEntrega(id, 'cancelada', motivo),
        meta: { silenciarError: true },
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: VENTAS_KEYS.all });
            queryClient.invalidateQueries({ queryKey: VENTAS_KEYS.detail(id) });
        },
    });
};

export const useDeleteVenta = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, motivo }: { id: number; motivo: string }) => ventasApi.delete(id, motivo),
        // El error (p. ej. el 409 que dice qué revertir antes) lo muestra el diálogo
        // del motivo, adentro; el toast global lo repetiría encima.
        meta: { silenciarError: true },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: VENTAS_KEYS.all });
            queryClient.invalidateQueries({ queryKey: ['vehiculos'] });
        },
    });
};
