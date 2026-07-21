import { IAuditLogRepository } from '../../../domain/repositories/IAuditLogRepository';
import { QueryOptions } from '../../../types/common';

export class GetAuditLogs {
    constructor(private readonly repository: IAuditLogRepository) { }

    async execute(filter: any = {}, options: QueryOptions = {}) {
        return this.repository.findAll(filter, options);
    }
}
