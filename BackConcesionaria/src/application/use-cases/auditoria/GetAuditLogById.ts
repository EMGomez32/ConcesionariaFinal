import { IAuditLogRepository } from '../../../domain/repositories/IAuditLogRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';

export class GetAuditLogById {
    constructor(private readonly repository: IAuditLogRepository) { }

    async execute(id: number) {
        const a = await this.repository.findById(id);
        if (!a) throw new NotFoundException('Registro de auditoría');
        return a;
    }
}
