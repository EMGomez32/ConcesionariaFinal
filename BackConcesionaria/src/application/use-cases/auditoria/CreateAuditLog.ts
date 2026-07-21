import { IAuditLogRepository } from '../../../domain/repositories/IAuditLogRepository';

export class CreateAuditLog {
    constructor(private readonly repository: IAuditLogRepository) { }

    async execute(data: any) {
        return this.repository.create(data);
    }
}
