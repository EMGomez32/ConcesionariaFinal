import { Request, Response, NextFunction } from 'express';
import prisma from '../../infrastructure/database/prisma';

// Búsqueda global para el command palette (Ctrl/⌘+K). Busca en las entidades con
// página de detalle: vehículos, clientes y proveedores. El aislamiento por tenant
// y el filtro de borrados los aplica la extensión de Prisma (top-level finds).
export class SearchController {
    // GET /api/search?q=<texto>
    static async global(req: Request, res: Response, next: NextFunction) {
        try {
            const q = String(req.query.q ?? '').trim();
            // Menos de 2 chars no busca: evita escaneos por una sola letra.
            if (q.length < 2) {
                return res.json({ vehiculos: [], clientes: [], proveedores: [] });
            }

            const contains = { contains: q, mode: 'insensitive' as const };
            const TAKE = 6;

            const [vehiculos, clientes, proveedores] = await Promise.all([
                prisma.vehiculo.findMany({
                    where: { OR: [{ marca: contains }, { modelo: contains }, { version: contains }, { dominio: contains }] },
                    take: TAKE,
                    orderBy: { updatedAt: 'desc' },
                    select: { id: true, marca: true, modelo: true, version: true, anio: true, dominio: true, estado: true },
                }),
                prisma.cliente.findMany({
                    where: { OR: [{ nombre: contains }, { dni: contains }, { telefono: contains }, { email: contains }] },
                    take: TAKE,
                    orderBy: { updatedAt: 'desc' },
                    select: { id: true, nombre: true, dni: true, telefono: true, email: true },
                }),
                prisma.proveedor.findMany({
                    where: { OR: [{ nombre: contains }, { email: contains }, { telefono: contains }] },
                    take: TAKE,
                    orderBy: { updatedAt: 'desc' },
                    select: { id: true, nombre: true, email: true, telefono: true },
                }),
            ]);

            res.json({
                vehiculos: vehiculos.map((v) => ({
                    id: v.id,
                    titulo: `${v.marca} ${v.modelo}${v.version ? ` ${v.version}` : ''}`.trim(),
                    subtitulo: [v.dominio, v.anio, v.estado].filter(Boolean).join(' · '),
                })),
                clientes: clientes.map((c) => ({
                    id: c.id,
                    titulo: c.nombre,
                    subtitulo: [c.dni ? `DNI ${c.dni}` : '', c.telefono || c.email || ''].filter(Boolean).join(' · '),
                })),
                proveedores: proveedores.map((p) => ({
                    id: p.id,
                    titulo: p.nombre,
                    subtitulo: [p.telefono, p.email].filter(Boolean).join(' · '),
                })),
            });
        } catch (error) {
            next(error);
        }
    }
}
