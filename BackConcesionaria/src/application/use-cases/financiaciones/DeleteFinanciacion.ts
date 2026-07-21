import { IFinanciacionRepository } from '../../../domain/repositories/IFinanciacionRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';
import prisma from '../../../infrastructure/database/prisma';

// HU-73: soft delete de financiación. El extension de Prisma intercepta
// `delete` y lo convierte en update de `deletedAt`, así que las cuotas y
// pagos asociados quedan en BD para histórico (también soft-deleted via
// cascade lógico de queries por deletedAt).
export class DeleteFinanciacion {
    constructor(private readonly repository: IFinanciacionRepository) { }

    async execute(id: number) {
        const exists = await this.repository.findById(id);
        if (!exists) throw new NotFoundException('Financiación');

        await prisma.financiacion.delete({ where: { id } });
    }
}
