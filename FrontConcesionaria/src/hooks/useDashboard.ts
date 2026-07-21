import { useQuery } from '@tanstack/react-query';
import { vehiculosApi } from '../api/vehiculos.api';
import { ventasApi } from '../api/ventas.api';
import { clientesApi } from '../api/clientes.api';
import { reservasApi } from '../api/reservas.api';

export const dashboardKeys = {
    all: ['dashboard'] as const,
    stats: () => [...dashboardKeys.all, 'stats'] as const,
    stockDistribution: () => [...dashboardKeys.all, 'stockDistribution'] as const,
};

export const useDashboardStats = () => {
    return useQuery({
        queryKey: dashboardKeys.stats(),
        queryFn: async () => {
            const [vehiculos, ventas, clientes, reservas] = await Promise.all([
                vehiculosApi.getAll({ estado: 'publicado' }),
                ventasApi.getAll({}),
                clientesApi.getAll({}),
                reservasApi.getAll({ estado: 'activa' })
            ]);

            return {
                vehiculos: vehiculos.totalResults ?? 0,
                ventas: ventas.totalResults ?? 0,
                clientes: clientes.totalResults ?? 0,
                reservas: (reservas as { totalResults?: number })?.totalResults ?? 0,
            };
        },
        staleTime: 1000 * 60 * 2,
    });
};

export interface StockSlice {
    estado: 'preparacion' | 'publicado' | 'reservado' | 'vendido';
    label: string;
    value: number;
    color: string;
}

export const useStockDistribution = () => {
    return useQuery({
        queryKey: dashboardKeys.stockDistribution(),
        queryFn: async (): Promise<StockSlice[]> => {
            const [prep, pub, res, ven] = await Promise.all([
                vehiculosApi.getAll({ estado: 'preparacion' }, { limit: 1 }),
                vehiculosApi.getAll({ estado: 'publicado' }, { limit: 1 }),
                vehiculosApi.getAll({ estado: 'reservado' }, { limit: 1 }),
                vehiculosApi.getAll({ estado: 'vendido' }, { limit: 1 }),
            ]);
            return [
                { estado: 'preparacion', label: 'En preparación', value: prep.totalResults ?? 0, color: 'var(--warning)' },
                { estado: 'publicado', label: 'Publicados', value: pub.totalResults ?? 0, color: 'var(--accent)' },
                { estado: 'reservado', label: 'Reservados', value: res.totalResults ?? 0, color: 'var(--accent-3)' },
                { estado: 'vendido', label: 'Vendidos', value: ven.totalResults ?? 0, color: 'var(--accent-2)' },
            ];
        },
        staleTime: 1000 * 60 * 2,
    });
};
