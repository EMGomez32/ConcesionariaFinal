import client from './client';

export type AccionAudit = 'create' | 'update' | 'cancel' | 'delete_soft' | 'login' | 'logout' | 'refinanciar';

export interface AuditLog {
  id: number;
  concesionariaId: number;
  usuarioId?: number;
  entidad: string;
  entidadId?: number;
  accion: AccionAudit;
  detalle?: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
  usuario?: { nombre: string; email: string };
}

export interface AuditLogFilter {
  entidad?: string;
  accion?: AccionAudit;
  usuarioId?: number;
  startDate?: string;
  endDate?: string;
  limit?: number;
  page?: number;
}

export const auditoriaApi = {
  getAll: (params: AuditLogFilter = {}) =>
    client.get('/auditoria', { params }),

  getById: (id: number) =>
    client.get(`/auditoria/${id}`),

  exportCsv: (params: AuditLogFilter = {}) =>
    client.get('/auditoria/export', {
      params,
      responseType: 'blob',
    }),
};
