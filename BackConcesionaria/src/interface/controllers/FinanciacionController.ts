import { Request, Response, NextFunction } from 'express';
import { PrismaFinanciacionRepository, planDeCuotas } from '../../infrastructure/database/repositories/PrismaFinanciacionRepository';
import { GetFinanciaciones } from '../../application/use-cases/financiaciones/GetFinanciaciones';
import { GetFinanciacionById } from '../../application/use-cases/financiaciones/GetFinanciacionById';
import { CreateFinanciacion } from '../../application/use-cases/financiaciones/CreateFinanciacion';
import { UpdateFinanciacion } from '../../application/use-cases/financiaciones/UpdateFinanciacion';
import { DeleteFinanciacion } from '../../application/use-cases/financiaciones/DeleteFinanciacion';
import { RegistrarPagoCuota } from '../../application/use-cases/financiaciones/RegistrarPagoCuota';
import { RefinanciarFinanciacion } from '../../application/use-cases/financiaciones/RefinanciarFinanciacion';
import { audit } from '../../infrastructure/security/audit';
import { resolveConcesionariaId } from '../../infrastructure/security/resolveConcesionariaId';

const repository = new PrismaFinanciacionRepository();
const refinanciarUC = new RefinanciarFinanciacion(repository);
const getFinanciacionesUC = new GetFinanciaciones(repository);
const getFinanciacionByIdUC = new GetFinanciacionById(repository);
const createFinanciacionUC = new CreateFinanciacion(repository);
const updateFinanciacionUC = new UpdateFinanciacion(repository);
const deleteFinanciacionUC = new DeleteFinanciacion(repository);
const registrarPagoUC = new RegistrarPagoCuota();

export class FinanciacionController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { limit, page, sortBy, sortOrder, ...filters } = req.query;
            const result = await getFinanciacionesUC.execute(filters, { limit, page, sortBy, sortOrder } as any);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await getFinanciacionByIdUC.execute(id);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /financiaciones/simular — devuelve el plan de cuotas SIN persistir nada.
     * Reutiliza la MISMA función pura `planDeCuotas` que usa el create/refinanciar
     * (con las mismas coerciones parseFloat/parseInt), así los números del simulador
     * coinciden exactamente con los de una financiación real.
     */
    static async simular(req: Request, res: Response, next: NextFunction) {
        try {
            const { montoFinanciado, cuotas, tasaMensual, moneda, fechaInicio, diaVencimiento } = req.body;
            const total = parseFloat(montoFinanciado);
            const n = parseInt(cuotas, 10);
            // fecha/día sólo cambian las fechas de vencimiento, no los montos: se
            // defaultan (hoy / día 10) para poder simular con sólo monto + cuotas.
            const inicio = fechaInicio || new Date().toISOString().slice(0, 10);
            const dia = diaVencimiento != null ? Number(diaVencimiento) : 10;

            const cuotasPlan = planDeCuotas(total, n, tasaMensual, inicio, dia);
            const totalAPagar = Math.round(cuotasPlan.reduce((s, c) => s + c.montoCuota, 0) * 100) / 100;

            res.json({
                resumen: {
                    montoFinanciado: total,
                    cuotas: n,
                    tasaMensual: tasaMensual != null && tasaMensual !== '' ? Number(tasaMensual) : 0,
                    moneda: moneda || 'ARS',
                    // La 1ª cuota puede ser 1 centavo mayor por el reparto del resto;
                    // el detalle exacto va en el array `cuotas`.
                    valorCuota: cuotasPlan[0]?.montoCuota ?? 0,
                    totalAPagar,
                    costoFinanciero: Math.round((totalAPagar - total) * 100) / 100,
                    fechaInicio: inicio,
                    diaVencimiento: dia,
                },
                cuotas: cuotasPlan,
            });
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const concesionariaId = resolveConcesionariaId(req.body?.concesionariaId);
            const result = await createFinanciacionUC.execute({ ...req.body, concesionariaId });
            await audit({
                entidad: 'Financiacion',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `Financiacion ${(result as any)?.id} creada`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async refinanciar(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await refinanciarUC.execute(id, req.body);
            await audit({
                entidad: 'Financiacion',
                accion: 'refinanciar',
                entidadId: (result as any)?.id,
                detalle: `Financiacion ${id} refinanciada en el contrato ${(result as any)?.id} por ${(result as any)?.montoFinanciado} ${(result as any)?.moneda}`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await updateFinanciacionUC.execute(id, req.body);
            await audit({
                entidad: 'Financiacion',
                accion: 'update',
                entidadId: id,
                detalle: `Financiacion ${id} actualizada`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            await deleteFinanciacionUC.execute(id);
            await audit({
                entidad: 'Financiacion',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `Financiacion ${id} eliminada`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }

    static async pagarCuota(req: Request, res: Response, next: NextFunction) {
        try {
            const cuotaId = parseInt(req.params.cuotaId as string, 10);
            const result = await registrarPagoUC.execute(cuotaId, req.body);
            await audit({
                entidad: 'Financiacion',
                accion: 'update',
                entidadId: (result as any)?.financiacionId ?? (result as any)?.id ?? cuotaId,
                detalle: `Pago de cuota ${cuotaId} registrado`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
}
