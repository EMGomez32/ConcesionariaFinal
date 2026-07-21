import { useQuery } from '@tanstack/react-query';
import { auditoriaApi, type AuditLogFilter } from '../api/auditoria.api';
import type { PaginationOptions } from '../types/common.types';

export const auditKeys = {
    all: ['audit'] as const,
    lists: () => [...auditKeys.all, 'list'] as const,
    list: (filters: AuditLogFilter) => [...auditKeys.lists(), filters] as const,
    details: () => [...auditKeys.all, 'detail'] as const,
    detail: (id: number) => [...auditKeys.details(), id] as const,
};

export const useAuditLogs = (
    filters: AuditLogFilter = {},
    options: PaginationOptions = {},
    // `enabled` permite no disparar la consulta cuando el usuario no tiene acceso
    // (el log de auditoría es admin-only; sin esto el dashboard de un vendedor
    // haría un request que devuelve 403).
    queryOptions: { enabled?: boolean } = {},
) => {
    return useQuery({
        queryKey: auditKeys.list({ ...filters, ...options }),
        queryFn: async () => {
            const res = await auditoriaApi.getAll({ ...filters, ...options });
            return res;
        },
        enabled: queryOptions.enabled ?? true,
    });
};

export const useAuditLog = (id: number) => {
    return useQuery({
        queryKey: auditKeys.detail(id),
        queryFn: async () => {
            const res = await auditoriaApi.getById(id);
            return res;
        },
        enabled: !!id,
    });
};
