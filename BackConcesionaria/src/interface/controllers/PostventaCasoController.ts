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
            const result = await getCasosUC.execute(filters, { limit, page, sortBy, sortOrder } as any);
            res.json(result);
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
                { key: 'facturado', header: 'Facturado' },
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
            res.json(result);
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
