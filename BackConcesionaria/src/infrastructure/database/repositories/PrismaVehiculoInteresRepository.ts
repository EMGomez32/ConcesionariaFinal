import { IVehiculoInteresRepository } from '../../../domain/repositories/IVehiculoInteresRepository';
import { VehiculoInteres } from '../../../domain/entities/VehiculoInteres';
import prisma from '../prisma';

// Sólo estos campos entran del body (anti mass-assignment). concesionariaId lo
// inyecta la extensión RLS (o el controller para super_admin).
const EDITABLE = ['clienteId', 'vehiculoId', 'nota'] as const;

function pickEditable(data: any = {}): Record<string, any> {
    const out: Record<string, any> = {};
    for (const key of EDITABLE) {
        if (data[key] !== undefined) out[key] = data[key];
    }
    return out;
}

const includeRefs = {
    cliente: { select: { id: true, nombre: true, telefono: true, estadoLead: true } },
    vehiculo: { select: { id: true, marca: true, modelo: true, version: true, anio: true, dominio: true, estado: true, precioLista: true, moneda: true } },
};

export class PrismaVehiculoInteresRepository implements IVehiculoInteresRepository {
    async findByCliente(clienteId: number): Promise<VehiculoInteres[]> {
        const rows = await prisma.vehiculoInteres.findMany({
            where: { clienteId },
            orderBy: { createdAt: 'desc' },
            include: includeRefs,
        });
        return rows.map((r) => this.mapToEntity(r));
    }

    async findByVehiculo(vehiculoId: number): Promise<VehiculoInteres[]> {
        const rows = await prisma.vehiculoInteres.findMany({
            where: { vehiculoId },
            orderBy: { createdAt: 'desc' },
            include: includeRefs,
        });
        return rows.map((r) => this.mapToEntity(r));
    }

    async findById(id: number): Promise<VehiculoInteres | null> {
        const r = await prisma.vehiculoInteres.findUnique({ where: { id }, include: includeRefs });
        return r ? this.mapToEntity(r) : null;
    }

    async create(data: any): Promise<{ entity: VehiculoInteres; created: boolean }> {
        const payload = pickEditable(data);
        if (data.concesionariaId != null) payload.concesionariaId = Number(data.concesionariaId);
        // Idempotente: si el cliente ya tiene marcado ese auto, no dup (chocaría con el
        // @@unique) — se actualiza la nota y se devuelve el existente. El findFirst
        // queda scoped al tenant por la extensión.
        const existing = await prisma.vehiculoInteres.findFirst({
            where: { clienteId: payload.clienteId, vehiculoId: payload.vehiculoId },
        });
        if (existing) {
            return { entity: await this.updateNota(existing.id, payload.nota ?? existing.nota), created: false };
        }
        try {
            const created = await prisma.vehiculoInteres.create({ data: payload as any, include: includeRefs });
            return { entity: this.mapToEntity(created), created: true };
        } catch (e: any) {
            // Carrera: otro request idéntico insertó la fila entre el findFirst y el
            // create (@@unique → P2002). La recuperamos y actualizamos la nota, así el
            // POST sigue siendo idempotente en vez de tirar 409 por un doble-submit.
            if (e?.code === 'P2002') {
                const row = await prisma.vehiculoInteres.findFirst({
                    where: { clienteId: payload.clienteId, vehiculoId: payload.vehiculoId },
                });
                if (row) return { entity: await this.updateNota(row.id, payload.nota ?? row.nota), created: false };
            }
            throw e;
        }
    }

    private async updateNota(id: number, nota: string | null): Promise<VehiculoInteres> {
        const upd = await prisma.vehiculoInteres.update({
            where: { id },
            data: { nota },
            include: includeRefs,
        });
        return this.mapToEntity(upd);
    }

    async delete(id: number): Promise<void> {
        // Borrado DURO (no está en SOFT_DELETE_MODELS): quitar el interés lo elimina de
        // verdad, así se puede re-marcar sin chocar con el @@unique. La extensión
        // inyecta concesionariaId al where → un tenant no borra el interés de otro.
        await prisma.vehiculoInteres.delete({ where: { id } });
    }

    private mapToEntity(r: any): VehiculoInteres {
        return new VehiculoInteres(
            r.id,
            r.concesionariaId,
            r.clienteId,
            r.vehiculoId,
            r.nota ?? null,
            r.createdAt,
            r.updatedAt,
            r.cliente,
            r.vehiculo ? { ...r.vehiculo, precioLista: r.vehiculo.precioLista == null ? null : Number(r.vehiculo.precioLista) } : undefined,
        );
    }
}
