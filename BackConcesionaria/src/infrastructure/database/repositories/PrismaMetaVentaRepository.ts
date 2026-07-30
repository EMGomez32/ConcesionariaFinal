import { IMetaVentaRepository } from '../../../domain/repositories/IMetaVentaRepository';
import { MetaVenta } from '../../../domain/entities/MetaVenta';
import prisma from '../prisma';

export class PrismaMetaVentaRepository implements IMetaVentaRepository {
    async findByPeriodo(anio: number, mes: number, concesionariaId?: number): Promise<MetaVenta | null> {
        const where: any = { anio: Number(anio), mes: Number(mes) };
        // Para el super_admin (sin inyección de tenant) hay que acotar a mano; para
        // el admin la extensión ya inyecta el tenant en el where.
        if (concesionariaId != null) where.concesionariaId = Number(concesionariaId);
        const m = await prisma.metaVenta.findFirst({ where });
        return m ? this.mapToEntity(m) : null;
    }

    async upsertByPeriodo(data: any): Promise<MetaVenta> {
        const anio = Number(data.anio);
        const mes = Number(data.mes);
        const unidadesObjetivo = data.unidadesObjetivo != null ? Number(data.unidadesObjetivo) : null;
        const montoObjetivo = data.montoObjetivo != null ? Number(data.montoObjetivo) : null;
        const moneda = data.moneda ?? 'ARS';
        const concesionariaId = data.concesionariaId != null ? Number(data.concesionariaId) : undefined;

        // Defensa en profundidad (igual que Cotizacion): el tenant destino es
        // obligatorio. Sin él, un find/create SIN scope podría pisar la meta de
        // OTRA concesionaria. El controller ya corta si falta; acá se falla explícito.
        if (concesionariaId === undefined) {
            throw new Error('upsertByPeriodo requiere concesionariaId (tenant destino)');
        }

        // No se usa prisma.upsert: la extensión RLS inyecta concesionariaId en el
        // where de nivel superior y rompería el locator único. find + create/update.
        const existing = await this.findByPeriodo(anio, mes, concesionariaId);
        if (existing) {
            const updated = await prisma.metaVenta.update({
                where: { id: existing.id },
                data: { unidadesObjetivo, montoObjetivo, moneda },
            });
            return this.mapToEntity(updated);
        }

        const created = await prisma.metaVenta.create({
            data: { anio, mes, unidadesObjetivo, montoObjetivo, moneda, concesionariaId },
        });
        return this.mapToEntity(created);
    }

    async delete(id: number): Promise<void> {
        // Dato de configuración, no soft-delete: borrado físico.
        await prisma.metaVenta.delete({ where: { id } });
    }

    private mapToEntity(m: any): MetaVenta {
        return new MetaVenta(
            m.id,
            m.concesionariaId,
            m.anio,
            m.mes,
            m.unidadesObjetivo ?? null,
            // Decimal de Prisma llega como string.
            m.montoObjetivo != null ? Number(m.montoObjetivo) : null,
            m.moneda ?? 'ARS',
            m.createdAt,
            m.updatedAt,
        );
    }
}
