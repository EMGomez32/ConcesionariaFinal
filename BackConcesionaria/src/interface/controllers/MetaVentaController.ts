import { Request, Response, NextFunction } from 'express';
import { PrismaMetaVentaRepository } from '../../infrastructure/database/repositories/PrismaMetaVentaRepository';
import { GetMetaVenta } from '../../application/use-cases/metas/GetMetaVenta';
import { UpsertMetaVenta } from '../../application/use-cases/metas/UpsertMetaVenta';
import { DeleteMetaVenta } from '../../application/use-cases/metas/DeleteMetaVenta';
import { audit } from '../../infrastructure/security/audit';
import { resolveConcesionariaId } from '../../infrastructure/security/resolveConcesionariaId';
import { BaseException } from '../../domain/exceptions/BaseException';

const repository = new PrismaMetaVentaRepository();
const getMetaUC = new GetMetaVenta(repository);
const upsertUC = new UpsertMetaVenta(repository);
const deleteUC = new DeleteMetaVenta(repository);

/** Entero de query validado en un rango, con default. */
function enteroEnRango(valor: unknown, min: number, max: number, porDefecto: number, campo: string): number {
    if (valor === undefined || valor === '') return porDefecto;
    const n = Number(valor);
    if (!Number.isInteger(n) || n < min || n > max) {
        throw new BaseException(400, `${campo} debe ser un entero entre ${min} y ${max}`, 'VALIDATION_ERROR');
    }
    return n;
}

export class MetaVentaController {
    /** GET /metas/actual?anio=&mes= — la meta de un mes (por defecto, el actual). */
    static async getActual(req: Request, res: Response, next: NextFunction) {
        try {
            const ahora = new Date();
            const anio = enteroEnRango(req.query.anio, 2000, 2100, ahora.getFullYear(), 'anio');
            const mes = enteroEnRango(req.query.mes, 1, 12, ahora.getMonth() + 1, 'mes');
            const result = await getMetaUC.execute(anio, mes);
            // 200 con null es válido: "todavía no fijaste una meta para ese mes".
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async upsert(req: Request, res: Response, next: NextFunction) {
        try {
            const concesionariaId = resolveConcesionariaId(req.body?.concesionariaId);
            // Sólo es null para un super_admin que no eligió tenant (el admin siempre
            // trae el suyo). Sin este guard, el upsert caería en un find/create SIN
            // scope y podría pisar la meta de un tenant arbitrario. Se corta con 400.
            if (concesionariaId == null) {
                throw new BaseException(400, 'Elegí una concesionaria para fijar la meta', 'VALIDATION_ERROR');
            }
            const result = await upsertUC.execute({ ...req.body, concesionariaId });
            await audit({
                entidad: 'MetaVenta',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `Meta ${(result as any)?.mes}/${(result as any)?.anio}`,
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
                entidad: 'MetaVenta',
                accion: 'delete',
                entidadId: id,
                detalle: `Meta ${id} eliminada`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
}
