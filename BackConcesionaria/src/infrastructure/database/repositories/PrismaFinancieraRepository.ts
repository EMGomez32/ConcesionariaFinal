import { IFinancieraRepository } from '../../../domain/repositories/IFinancieraRepository';
import { Financiera } from '../../../domain/entities/Financiera';
import prisma from '../prisma';

// Campos que el cliente puede escribir. `concesionariaId` lo inyecta la
// extensión RLS desde el token, así que nunca se toma del body.
const EDITABLE = ['nombre', 'tipo', 'contacto', 'telefono', 'email', 'activo'] as const;

function pickEditable(data: any = {}): Record<string, any> {
    const out: Record<string, any> = {};
    for (const key of EDITABLE) {
        if (data[key] !== undefined) out[key] = data[key];
    }
    return out;
}

export class PrismaFinancieraRepository implements IFinancieraRepository {
    async findAll(concesionariaId: number): Promise<Financiera[]> {
        const results = await prisma.financiera.findMany({
            where: { concesionariaId },
            orderBy: { nombre: 'asc' }
        });
        return results.map(this.mapToEntity);
    }

    async findById(id: number): Promise<Financiera | null> {
        const f = await prisma.financiera.findUnique({ where: { id } });
        return f ? this.mapToEntity(f) : null;
    }

    async create(data: any): Promise<Financiera> {
        const payload = pickEditable(data);
        // super_admin no recibe la inyección de concesionariaId del RLS: el
        // controller lo resuelve y acá se setea explícito, fuera de pickEditable.
        if (data.concesionariaId != null) {
            payload.concesionariaId = Number(data.concesionariaId);
        }
        const f = await prisma.financiera.create({ data: payload as any });
        return this.mapToEntity(f);
    }

    async update(id: number, data: any): Promise<Financiera> {
        const f = await prisma.financiera.update({
            where: { id },
            data: pickEditable(data),
        });
        return this.mapToEntity(f);
    }

    async delete(id: number): Promise<void> {
        await prisma.financiera.delete({ where: { id } });
    }

    async countSolicitudes(id: number): Promise<number> {
        return prisma.solicitudFinanciacion.count({ where: { financieraId: id } });
    }

    private mapToEntity(f: any): Financiera {
        return new Financiera(
            f.id,
            f.concesionariaId,
            f.nombre,
            f.tipo,
            f.contacto ?? null,
            f.telefono ?? null,
            f.email ?? null,
            f.activo,
            f.createdAt,
            f.updatedAt,
            f.deletedAt ?? null
        );
    }
}
