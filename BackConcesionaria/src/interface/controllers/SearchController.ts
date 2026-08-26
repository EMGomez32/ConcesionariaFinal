import { Request, Response, NextFunction } from 'express';
import prisma from '../../infrastructure/database/prisma';
import { conFiltroCartera } from '../../application/services/carteraCliente';
import { actorEsVendedorPuro } from '../../infrastructure/security/roles';

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

            // El command palette era la puerta de atrás del recorte de cartera: con
            // `?q=` de dos letras un vendedor sacaba nombre, DNI, teléfono y email de
            // clientes ajenos sin pasar por `/clientes`. Mismo filtro, misma fuente.
            const whereClientes = await conFiltroCartera({
                OR: [{ nombre: contains }, { dni: contains }, { telefono: contains }, { email: contains }],
            });

            const [vehiculos, clientes, proveedores] = await Promise.all([
                prisma.vehiculo.findMany({
                    where: { OR: [{ marca: contains }, { modelo: contains }, { version: contains }, { dominio: contains }] },
                    take: TAKE,
                    orderBy: { updatedAt: 'desc' },
                    select: { id: true, marca: true, modelo: true, version: true, anio: true, dominio: true, estado: true },
                }),
                prisma.cliente.findMany({
                    where: whereClientes,
                    take: TAKE,
                    orderBy: { updatedAt: 'desc' },
                    select: { id: true, nombre: true, dni: true, telefono: true, email: true },
                }),
                // El vendedor puro no busca proveedores: su ficha (`GET /proveedores/:id`)
                // ahora es admin+postventa, así que devolverle el resultado sólo le
                // ofrecería un link a un 403. Se devuelve la lista vacía en vez de
                // recortar campos: acá el dato que sobra es la ENTIDAD, no una columna.
                actorEsVendedorPuro() ? Promise.resolve([]) : prisma.proveedor.findMany({
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
