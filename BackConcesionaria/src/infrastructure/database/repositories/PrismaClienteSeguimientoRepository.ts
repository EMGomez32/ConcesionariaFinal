import { IClienteSeguimientoRepository } from '../../../domain/repositories/IClienteSeguimientoRepository';
import { ClienteSeguimiento } from '../../../domain/entities/ClienteSeguimiento';
import prisma from '../prisma';

// Campos que el cliente puede escribir. `concesionariaId` nunca entra por acá: lo
// inyecta la extensión RLS (o lo setea el controller para super_admin). `usuarioId`
// lo estampa el use case desde el token (no se confía en el body). Zod ya recorta,
// pero esta whitelist es la segunda barrera anti mass-assignment (el repo pasa el
// objeto a prisma.create).
const EDITABLE = ['clienteId', 'usuarioId', 'tipo', 'fecha', 'nota', 'proximoContacto'] as const;
// @db.Date: el <input type="date"> manda 'YYYY-MM-DD' y Prisma espera DateTime.
const DATE_KEYS = ['fecha', 'proximoContacto'];

function pickEditable(data: any = {}): Record<string, any> {
    const out: Record<string, any> = {};
    for (const key of EDITABLE) {
        if (data[key] === undefined) continue;
        // proximoContacto es nullable: `new Date(null)` daría 1970, no null.
        out[key] = DATE_KEYS.includes(key) && data[key] !== null ? new Date(data[key]) : data[key];
    }
    return out;
}

export class PrismaClienteSeguimientoRepository implements IClienteSeguimientoRepository {
    async findByCliente(clienteId: number): Promise<ClienteSeguimiento[]> {
        const results = await prisma.clienteSeguimiento.findMany({
            where: { clienteId },
            orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
            include: { usuario: { select: { id: true, nombre: true } } },
        });
        return results.map((r) => this.mapToEntity(r));
    }

    async findById(id: number): Promise<ClienteSeguimiento | null> {
        const s = await prisma.clienteSeguimiento.findUnique({ where: { id } });
        return s ? this.mapToEntity(s) : null;
    }

    async create(data: any): Promise<ClienteSeguimiento> {
        const payload = pickEditable(data);
        // super_admin no recibe la inyección del RLS: el controller lo resuelve y acá
        // se setea explícito, fuera de la whitelist.
        if (data.concesionariaId != null) payload.concesionariaId = Number(data.concesionariaId);
        const s = await prisma.clienteSeguimiento.create({
            data: payload as any,
            include: { usuario: { select: { id: true, nombre: true } } },
        });
        return this.mapToEntity(s);
    }

    async delete(id: number): Promise<void> {
        // La extensión reescribe el delete a un soft-delete (ClienteSeguimiento está
        // en SOFT_DELETE_MODELS).
        await prisma.clienteSeguimiento.delete({ where: { id } });
    }

    async setProximoHecho(id: number, hecho: boolean): Promise<ClienteSeguimiento> {
        // La extensión inyecta el tenant (concesionariaId) al where del update, pero
        // NO el soft-delete (deletedAt:null sólo se aplica a lecturas). Por eso va
        // explícito acá: así un seguimiento ya borrado no es mutable ni aunque
        // alguien saque el findById previo del use-case (defensa en profundidad).
        const s = await prisma.clienteSeguimiento.update({
            where: { id, deletedAt: null },
            data: { proximoContactoHecho: hecho },
            include: { usuario: { select: { id: true, nombre: true } } },
        });
        return this.mapToEntity(s);
    }

    private mapToEntity(s: any): ClienteSeguimiento {
        return new ClienteSeguimiento(
            s.id,
            s.concesionariaId,
            s.clienteId,
            s.usuarioId,
            s.tipo,
            s.fecha,
            s.nota,
            s.proximoContacto ?? null,
            s.proximoContactoHecho ?? false,
            s.createdAt,
            s.updatedAt,
            s.deletedAt ?? null,
            s.usuario,
        );
    }
}
