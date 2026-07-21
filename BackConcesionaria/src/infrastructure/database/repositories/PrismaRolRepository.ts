import { IRolRepository } from '../../../domain/repositories/IRolRepository';
import { Rol } from '../../../domain/entities/Rol';
import prisma from '../prisma';

export class PrismaRolRepository implements IRolRepository {
    async findAll(): Promise<Rol[]> {
        const results = await prisma.rol.findMany();
        return results.map(this.mapToEntity);
    }

    async findById(id: number): Promise<Rol | null> {
        const r = await prisma.rol.findUnique({ where: { id } });
        return r ? this.mapToEntity(r) : null;
    }

    private mapToEntity(r: any): Rol {
        return new Rol(r.id, r.nombre, r.descripcion, r.createdAt, r.updatedAt);
    }
}
