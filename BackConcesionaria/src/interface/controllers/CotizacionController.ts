import { Request, Response, NextFunction } from 'express';
import { PrismaCotizacionRepository } from '../../infrastructure/database/repositories/PrismaCotizacionRepository';
import { GetCotizaciones } from '../../application/use-cases/cotizaciones/GetCotizaciones';
import { GetCotizacionVigente } from '../../application/use-cases/cotizaciones/GetCotizacionVigente';
import { UpsertCotizacion } from '../../application/use-cases/cotizaciones/UpsertCotizacion';
import { DeleteCotizacion } from '../../application/use-cases/cotizaciones/DeleteCotizacion';
import { audit } from '../../infrastructure/security/audit';
import { resolveConcesionariaId } from '../../infrastructure/security/resolveConcesionariaId';
import { BaseException } from '../../domain/exceptions/BaseException';

const repository = new PrismaCotizacionRepository();
const getCotizacionesUC = new GetCotizaciones(repository);
const getVigenteUC = new GetCotizacionVigente(repository);
const upsertUC = new UpsertCotizacion(repository);
const deleteUC = new DeleteCotizacion(repository);

/** 'YYYY-MM-DD' → Date (medianoche UTC). Devuelve undefined si no vino o es inválida. */
function parseFecha(v: unknown): Date | undefined {
    if (v === undefined || v === '') return undefined;
    const d = new Date(`${String(v).slice(0, 10)}T00:00:00.000Z`);
    return isNaN(d.getTime()) ? undefined : d;
}

export class CotizacionController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { limit, page, sortBy, sortOrder, ...filters } = req.query;
            const result = await getCotizacionesUC.execute(filters, { limit, page, sortBy, sortOrder } as any);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    /** GET /cotizaciones/vigente?fecha= — la cotización aplicable a una fecha (o la última cargada). */
    static async getVigente(req: Request, res: Response, next: NextFunction) {
        try {
            const fecha = parseFecha(req.query.fecha);
            const result = await getVigenteUC.execute(fecha);
            // 200 con null es válido: "todavía no cargaste ninguna cotización".
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async upsert(req: Request, res: Response, next: NextFunction) {
        try {
            const concesionariaId = resolveConcesionariaId(req.body?.concesionariaId);
            // resolveConcesionariaId sólo devuelve null para un super_admin que no
            // eligió tenant (un admin normal siempre trae el suyo del token). Sin
            // este guard, upsertByFecha caería en un findFirst SIN scope de tenant
            // y podría PISAR la cotización de un tenant arbitrario, o fallar con 500
            // al crear sin concesionaria_id. Se corta explícito con un 400: para
            // escribir un dato de referencia hay que decir de qué concesionaria es.
            if (concesionariaId == null) {
                throw new BaseException(400, 'Elegí una concesionaria para cargar la cotización', 'VALIDATION_ERROR');
            }
            const result = await upsertUC.execute({ ...req.body, concesionariaId });
            await audit({
                entidad: 'Cotizacion',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `Cotización ${(result as any)?.valor} para ${new Date((result as any)?.fecha).toISOString().slice(0, 10)}`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async remove(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            await deleteUC.execute(id);
            await audit({
                entidad: 'Cotizacion',
                accion: 'delete',
                entidadId: id,
                detalle: `Cotización ${id} eliminada`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
}
