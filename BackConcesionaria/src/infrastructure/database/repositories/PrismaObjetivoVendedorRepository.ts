import { IObjetivoVendedorRepository } from '../../../domain/repositories/IObjetivoVendedorRepository';
import { ObjetivoVendedor } from '../../../domain/entities/ObjetivoVendedor';
import prisma from '../prisma';

export class PrismaObjetivoVendedorRepository implements IObjetivoVendedorRepository {
    async findByPeriodo(anio: number, mes: number, concesionariaId?: number): Promise<ObjetivoVendedor[]> {
        const where: any = { anio: Number(anio), mes: Number(mes) };
        // Para el super_admin (sin inyección de tenant) hay que acotar a mano; para
        // el admin la extensión ya inyecta el tenant en el where.
        if (concesionariaId != null) where.concesionariaId = Number(concesionariaId);
        const rows = await prisma.objetivoVendedor.findMany({
            where,
            include: { vendedor: { select: { id: true, nombre: true } } },
            orderBy: { vendedorId: 'asc' },
        });
        return rows.map((r) => this.mapToEntity(r));
    }

    async findByVendedorPeriodo(vendedorId: number, anio: number, mes: number, concesionariaId?: number): Promise<ObjetivoVendedor | null> {
        const where: any = { vendedorId: Number(vendedorId), anio: Number(anio), mes: Number(mes) };
        if (concesionariaId != null) where.concesionariaId = Number(concesionariaId);
        const m = await prisma.objetivoVendedor.findFirst({ where });
        return m ? this.mapToEntity(m) : null;
    }

    async upsertByPeriodo(data: any): Promise<ObjetivoVendedor> {
        const vendedorId = Number(data.vendedorId);
        const anio = Number(data.anio);
        const mes = Number(data.mes);
        const unidadesObjetivo = data.unidadesObjetivo != null ? Number(data.unidadesObjetivo) : null;
        const montoObjetivo = data.montoObjetivo != null ? Number(data.montoObjetivo) : null;
        const moneda = data.moneda ?? 'ARS';
        const concesionariaId = data.concesionariaId != null ? Number(data.concesionariaId) : undefined;

        // Defensa en profundidad (igual que MetaVenta/Cotizacion): el tenant destino
        // es obligatorio. Sin él, un find/create SIN scope podría pisar el objetivo
        // de OTRA concesionaria. El controller ya corta si falta; acá se falla explícito.
        if (concesionariaId === undefined) {
            throw new Error('upsertByPeriodo requiere concesionariaId (tenant destino)');
        }

        // No se usa prisma.upsert: la extensión RLS inyecta concesionariaId en el
        // where de nivel superior y rompería el locator único. find + create/update.
        const existing = await this.findByVendedorPeriodo(vendedorId, anio, mes, concesionariaId);
        if (existing) {
            const updated = await prisma.objetivoVendedor.update({
                where: { id: existing.id },
                data: { unidadesObjetivo, montoObjetivo, moneda },
                include: { vendedor: { select: { id: true, nombre: true } } },
            });
            return this.mapToEntity(updated);
        }

        const created = await prisma.objetivoVendedor.create({
            data: { vendedorId, anio, mes, unidadesObjetivo, montoObjetivo, moneda, concesionariaId },
            include: { vendedor: { select: { id: true, nombre: true } } },
        });
        return this.mapToEntity(created);
    }

    async delete(id: number): Promise<void> {
        // Dato de configuración, no soft-delete: borrado físico.
        await prisma.objetivoVendedor.delete({ where: { id } });
    }

    private mapToEntity(m: any): ObjetivoVendedor {
        return new ObjetivoVendedor(
            m.id,
            m.concesionariaId,
            m.vendedorId,
            m.anio,
            m.mes,
            m.unidadesObjetivo ?? null,
            // Decimal de Prisma llega como string.
            m.montoObjetivo != null ? Number(m.montoObjetivo) : null,
            m.moneda ?? 'ARS',
            m.createdAt,
            m.updatedAt,
            m.vendedor,
        );
    }
}
