import client from './client';

// Espejo del enum AccionAudit de Prisma.
export type AccionAudit =
  | 'create' | 'update' | 'cancel' | 'delete_soft' | 'delete' | 'refinanciar'
  | 'login' | 'logout' | 'login_fail' | 'password_reset_request' | 'password_reset_done';

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
