import { Request, Response, NextFunction } from 'express';
import { PrismaPostventaCasoRepository } from '../../infrastructure/database/repositories/PrismaPostventaCasoRepository';
import { GetCasos } from '../../application/use-cases/postventa-casos/GetCasos';
import { GetCasoById } from '../../application/use-cases/postventa-casos/GetCasoById';
import { CreateCaso } from '../../application/use-cases/postventa-casos/CreateCaso';
import { UpdateCaso } from '../../application/use-cases/postventa-casos/UpdateCaso';
import { DeleteCaso } from '../../application/use-cases/postventa-casos/DeleteCaso';
import { audit } from '../../infrastructure/security/audit';
import { resolveConcesionariaId } from '../../infrastructure/security/resolveConcesionariaId';
import prisma from '../../infrastructure/database/prisma';
import { Col, sendCsv } from '../../utils/csv';
import { actorTieneRol } from '../../infrastructure/security/roles';

/**
 * Recorte de los importes del caso para quien no gestiona postventa.
 *
 * `montoFacturado` es la venta del trabajo y `items[].monto` es lo que se le pagó
 * al proveedor por hacerlo: la resta de los dos ES el margen de postventa, el
 * mismo que `/reportes/postventa` acaba de cerrarle al vendedor. `GET
 * /postventa-casos` y `/:id` quedan abiertos a propósito —el vendedor da de alta
 * reclamos de sus clientes y tiene que poder seguirlos— pero salen sin la plata.
 *
 * admin + postventa ven los importes; el resto ve el caso completo salvo esos dos
 * campos.
 */
function sanitizarImportesCaso<T>(caso: T, veImportes: boolean): T {
    if (veImportes || !caso || typeof caso !== 'object') return caso;
    const { montoFacturado, items, ...resto } = caso as any;
    void montoFacturado;
    return {
        ...resto,
        items: Array.isArray(items)
            ? items.map(({ monto, ...item }: any) => { void monto; return item; })
            : items,
    } as T;
}

const repository = new PrismaPostventaCasoRepository();
const getCasosUC = new GetCasos(repository);
const getCasoByIdUC = new GetCasoById(repository);
const createCasoUC = new CreateCaso(repository);
const updateCasoUC = new UpdateCaso(repository);
const deleteCasoUC = new DeleteCaso(repository);

export class PostventaCasoController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { limit, page, sortBy, sortOrder, ...filters } = req.query;
            const result: any = await getCasosUC.execute(filters, { limit, page, sortBy, sortOrder } as any);
            const veImportes = actorTieneRol('admin', 'postventa');
            res.json({ ...result, results: (result.results ?? []).map((c: any) => sanitizarImportesCaso(c, veImportes)) });
        } catch (error) {
            next(error);
        }
    }

    // Export CSV de la cartera de casos de postventa con los MISMOS filtros del
    // listado. Tope defensivo de 5000; si se supera, se avisa por header + log
    // (no truncar en silencio). Reusa sendCsv (BOM + escape anti-inyección).
    static async exportCsv(req: Request, res: Response, next: NextFunction) {
        try {
            const CAP = 5000;
            const veImportes = actorTieneRol('admin', 'postventa');
            const { limit, page, sortBy, sortOrder, ...filters } = req.query;
            void limit; void page; void sortBy; void sortOrder;
            const result: any = await getCasosUC.execute(
                filters,
                { limit: CAP, page: 1, sortBy: 'fechaReclamo', sortOrder: 'desc' } as any,
            );
            if (Number(result.totalResults) > CAP) {
                res.setHeader('X-Export-Truncated', String(result.totalResults));
                console.warn(`[export] postventa CSV truncado: ${result.totalResults} > ${CAP}`);
            }

            const toDia = (d: any) =>
                d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : '';

            const cols: Col[] = [
                { key: 'reclamo', header: 'Fecha reclamo' },
                { key: 'cliente', header: 'Cliente' },
                { key: 'telefono', header: 'Teléfono' },
                { key: 'vehiculo', header: 'Vehículo' },
                { key: 'dominio', header: 'Dominio' },
                { key: 'tipo', header: 'Tipo' },
                { key: 'estado', header: 'Estado' },
                { key: 'turno', header: 'Turno' },
                { key: 'hora', header: 'Hora turno' },
                { key: 'cierre', header: 'Cierre' },
                // La columna de plata sólo se emite para quien puede verla en
                // pantalla: un export que la lleve siempre convierte el recorte de
                // `sanitizarImportesCaso` en decorativo (la ruta es
                // admin+postventa+vendedor).
                ...(veImportes ? [{ key: 'facturado', header: 'Facturado' } as Col] : []),
                { key: 'service', header: 'Próximo service' },
            ];

            const rows = (result.results as any[]).map((c) => ({
                reclamo: toDia(c.fechaReclamo),
                cliente: c.cliente?.nombre ?? '',
                telefono: c.cliente?.telefono ?? '',
                vehiculo: c.vehiculo ? `${c.vehiculo.marca} ${c.vehiculo.modelo}`.trim() : '',
                dominio: c.vehiculo?.dominio ?? '',
                tipo: c.tipo ?? '',
                estado: c.estado,
                turno: toDia(c.fechaTurno),
                hora: c.horaTurno ?? '',
                cierre: toDia(c.fechaCierre),
                facturado: c.montoFacturado == null ? '' : Number(c.montoFacturado),
                service: toDia(c.proximoServiceFecha),
            }));

            sendCsv(res, 'postventa-casos', cols, rows);
        } catch (error) {
            next(error);
        }
    }

    static async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await getCasoByIdUC.execute(id);
            res.json(sanitizarImportesCaso(result, actorTieneRol('admin', 'postventa')));
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const concesionariaId = resolveConcesionariaId(req.body?.concesionariaId);
            const result = await createCasoUC.execute({ ...req.body, concesionariaId });
            await audit({
                entidad: 'PostventaCaso',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `PostventaCaso ${(result as any)?.id} creado`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await updateCasoUC.execute(id, req.body);
            await audit({
                entidad: 'PostventaCaso',
                accion: 'update',
                entidadId: id,
                detalle: `PostventaCaso ${id} actualizado`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            await deleteCasoUC.execute(id);
            await audit({
                entidad: 'PostventaCaso',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `PostventaCaso ${id} eliminado`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }

    /** HU-84: total de items del caso. */
    static async total(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const r = await prisma.postventaItem.aggregate({
                where: { casoId: id },
                _sum: { monto: true },
                _count: true,
            });
            res.json({
                casoId: id,
                total: Number(r._sum.monto ?? 0),
                count: r._count,
            });
        } catch (error) {
            next(error);
        }
    }
}
