import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { billingApi, type UpdateSubscriptionDto, type RegistrarPagoDto, type InvoiceStatus } from '../api/billing.api';
import type { PaginationOptions } from '../types/common.types';

export const billingKeys = {
    all: ['billing'] as const,
    planes: () => [...billingKeys.all, 'planes'] as const,
    subscriptions: () => [...billingKeys.all, 'subscriptions'] as const,
    subscription: (id: number) => [...billingKeys.subscriptions(), id] as const,
    mySubscription: () => [...billingKeys.all, 'my-subscription'] as const,
    invoices: () => [...billingKeys.all, 'invoices'] as const,
    invoice: (id: number) => [...billingKeys.invoices(), id] as const,
};

export const usePlanes = (params?: { activo?: boolean }) => {
    return useQuery({
        queryKey: [...billingKeys.planes(), params],
        queryFn: async () => {
            const res = await billingApi.getPlanes(params);
            return res;
        },
    });
};

export const useSubscriptions = () => {
    return useQuery({
        queryKey: billingKeys.subscriptions(),
        queryFn: async () => {
            const res = await billingApi.getInvoices({ limit: 100 });
            return res;
        },
    });
};

export const useUpdateSubscription = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: UpdateSubscriptionDto }) => billingApi.updateSubscription(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: billingKeys.subscriptions() });
        }
    });
};

export const useMySubscription = () => {
    return useQuery({
        queryKey: billingKeys.mySubscription(),
        queryFn: async () => {
            const res = await billingApi.getMySubscription();
            return res;
        },
    });
};

export const useInvoices = (filters: { status?: InvoiceStatus; subscriptionId?: number } = {}, options: PaginationOptions = {}) => {
    return useQuery({
        queryKey: [...billingKeys.invoices(), { ...filters, ...options }],
        queryFn: async () => {
            const res = await billingApi.getInvoices({ ...filters, ...options });
            return res;
        },
    });
};

export const useRegistrarPago = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: RegistrarPagoDto }) => billingApi.registrarPago(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: billingKeys.invoices() });
        },
    });
};
