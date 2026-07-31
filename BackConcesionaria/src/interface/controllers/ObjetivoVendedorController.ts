import { Request, Response, NextFunction } from 'express';
import prisma from '../../infrastructure/database/prisma';
import { PrismaObjetivoVendedorRepository } from '../../infrastructure/database/repositories/PrismaObjetivoVendedorRepository';
import { GetObjetivosVendedor } from '../../application/use-cases/objetivos-vendedor/GetObjetivosVendedor';
import { UpsertObjetivoVendedor } from '../../application/use-cases/objetivos-vendedor/UpsertObjetivoVendedor';
import { DeleteObjetivoVendedor } from '../../application/use-cases/objetivos-vendedor/DeleteObjetivoVendedor';
import { audit } from '../../infrastructure/security/audit';
import { resolveConcesionariaId } from '../../infrastructure/security/resolveConcesionariaId';
import { BaseException } from '../../domain/exceptions/BaseException';

const repository = new PrismaObjetivoVendedorRepository();
const getObjetivosUC = new GetObjetivosVendedor(repository);
const upsertUC = new UpsertObjetivoVendedor(repository);
const deleteUC = new DeleteObjetivoVendedor(repository);

const num = (v: unknown): number => Number(v ?? 0);

/** Entero de query validado en un rango, con default. */
function enteroEnRango(valor: unknown, min: number, max: number, porDefecto: number, campo: string): number {
    if (valor === undefined || valor === '') return porDefecto;
    const n = Number(valor);
    if (!Number.isInteger(n) || n < min || n > max) {
        throw new BaseException(400, `${campo} debe ser un entero entre ${min} y ${max}`, 'VALIDATION_ERROR');
    }
    return n;
}

/** Progreso en % (sin tope): 0 si no hay objetivo, null si el objetivo no se fijó. */
function pct(real: number, objetivo: number | null): number | null {
    if (objetivo == null) return null;
    if (objetivo <= 0) return 0;
    return Math.round((real / objetivo) * 100);
}

export class ObjetivoVendedorController {
    /**
     * GET /objetivos-vendedor?anio=&mes= — objetivos del período con su progreso
     * (unidades y facturado reales de las ventas del mes de cada vendedor).
     */
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const ahora = new Date();
            const anio = enteroEnRango(req.query.anio, 2000, 2100, ahora.getFullYear(), 'anio');
            const mes = enteroEnRango(req.query.mes, 1, 12, ahora.getMonth() + 1, 'mes');

            const objetivos = await getObjetivosUC.execute(anio, mes);

            // Sin objetivos fijados no hace falta ir a buscar las ventas.
            if (objetivos.length === 0) {
                res.json({ periodo: { anio, mes }, items: [], resumen: { vendedores: 0 } });
                return;
            }

            // Ventas del mes por vendedor. fechaVenta es @db.Date: se compara en UTC
            // puro (mismo criterio que el resto de los reportes). La extensión ya
            // filtra las borradas; los extras anulados no suman (filtro en el include).
            const desdeFecha = new Date(Date.UTC(anio, mes - 1, 1));
            const hastaFecha = new Date(Date.UTC(anio, mes, 1));
            const ventas = await prisma.venta.findMany({
                where: { fechaVenta: { gte: desdeFecha, lt: hastaFecha } },
                select: {
                    vendedorId: true,
                    precioVenta: true,
                    moneda: true,
                    extras: { where: { deletedAt: null }, select: { monto: true } },
                },
            });

            // vendedorId -> { unidades, facturadoPorMoneda }
            const agg = new Map<number, { unidades: number; facturado: Map<string, number> }>();
            for (const v of ventas) {
                if (v.vendedorId == null) continue;
                if (!agg.has(v.vendedorId)) agg.set(v.vendedorId, { unidades: 0, facturado: new Map() });
                const a = agg.get(v.vendedorId)!;
                a.unidades += 1;
                const extras = v.extras.reduce((s, e) => s + num(e.monto), 0);
                const facturado = num(v.precioVenta) + extras;
                a.facturado.set(v.moneda, (a.facturado.get(v.moneda) ?? 0) + facturado);
            }

            const items = objetivos.map((o) => {
                const a = agg.get(o.vendedorId);
                const unidadesReal = a?.unidades ?? 0;
                // El facturado real se compara SÓLO contra la moneda del objetivo:
                // mezclar ARS con USD no significaría nada sin una cotización.
                const montoReal = a?.facturado.get(o.moneda) ?? 0;
                return {
                    id: o.id,
                    vendedorId: o.vendedorId,
                    vendedor: o.vendedor?.nombre ?? 'Sin nombre',
                    moneda: o.moneda,
                    unidadesObjetivo: o.unidadesObjetivo,
                    unidadesReal,
                    unidadesPct: pct(unidadesReal, o.unidadesObjetivo),
                    montoObjetivo: o.montoObjetivo,
                    montoReal,
                    montoPct: pct(montoReal, o.montoObjetivo),
                };
            });

            res.json({ periodo: { anio, mes }, items, resumen: { vendedores: items.length } });
        } catch (error) {
            next(error);
        }
    }

    static async upsert(req: Request, res: Response, next: NextFunction) {
        try {
            const concesionariaId = resolveConcesionariaId(req.body?.concesionariaId);
            // Sólo es null para un super_admin que no eligió tenant (el admin siempre
            // trae el suyo). Sin este guard, el upsert caería en un find/create SIN
            // scope y podría pisar el objetivo de un tenant arbitrario. Se corta con 400.
            if (concesionariaId == null) {
                throw new BaseException(400, 'Elegí una concesionaria para fijar el objetivo', 'VALIDATION_ERROR');
            }
            const result = await upsertUC.execute({ ...req.body, concesionariaId });
            await audit({
                entidad: 'ObjetivoVendedor',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `Objetivo ${(result as any)?.mes}/${(result as any)?.anio} · vendedor ${(result as any)?.vendedorId}`,
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
                entidad: 'ObjetivoVendedor',
                accion: 'delete',
                entidadId: id,
                detalle: `Objetivo ${id} eliminado`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
}
