import { AuditLog } from '../entities/AuditLog';
import { PaginatedResponse, QueryOptions } from '../../types/common';

export interface IAuditLogRepository {
    findAll(filter?: any, options?: QueryOptions): Promise<PaginatedResponse<AuditLog>>;
    findById(id: number): Promise<AuditLog | null>;
    create(data: any): Promise<AuditLog>;
}
