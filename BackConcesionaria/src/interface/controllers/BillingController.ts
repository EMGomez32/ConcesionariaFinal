import { Request, Response, NextFunction } from 'express';
import { PrismaBillingRepository } from '../../infrastructure/database/repositories/PrismaBillingRepository';
import {
    GetPlanes, CreatePlan, UpdatePlan,
    GetSubscriptionByConcesionariaId,
    CreateOrUpdateSubscription,
    GetInvoices, CreateInvoice, GetInvoiceById,
    RegistrarPagoInvoice
} from '../../application/use-cases/billing/BillingUseCases';
import { context } from '../../infrastructure/security/context';
import { audit } from '../../infrastructure/security/audit';

const repository = new PrismaBillingRepository();
const getPlanesUC = new GetPlanes(repository);
const createPlanUC = new CreatePlan(repository);
const updatePlanUC = new UpdatePlan(repository);
const getSubUC = new GetSubscriptionByConcesionariaId(repository);
const createOrUpdateSubUC = new CreateOrUpdateSubscription(repository);
const getInvoicesUC = new GetInvoices(repository);
const createInvoiceUC = new CreateInvoice(repository);
const getInvoiceByIdUC = new GetInvoiceById(repository);
const registrarPagoUC = new RegistrarPagoInvoice(repository);

export class BillingController {
    // Planes
    static async getPlanes(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await getPlanesUC.execute(req.query);
            res.json(result);
        } catch (error) { next(error); }
    }

    static async createPlan(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await createPlanUC.execute(req.body);
            await audit({
                entidad: 'Plan',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `Plan ${(result as any)?.nombre ?? (result as any)?.id} creado`,
            });
            res.status(201).json(result);
        } catch (error) { next(error); }
    }

    static async updatePlan(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await updatePlanUC.execute(id, req.body);
            await audit({
                entidad: 'Plan',
                accion: 'update',
                entidadId: id,
                detalle: `Plan ${(result as any)?.nombre ?? id} actualizado`,
            });
            res.json(result);
        } catch (error) { next(error); }
    }

    // Suscripciones
    static async getMySubscription(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = context.getTenantId();
            const result = await getSubUC.execute(tenantId!);
            res.json(result);
        } catch (error) { next(error); }
    }

    static async getSubscriptionByConcesionariaId(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await getSubUC.execute(id);
            res.json(result);
        } catch (error) { next(error); }
    }

    static async updateSubscription(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await createOrUpdateSubUC.execute(id, req.body);
            await audit({
                entidad: 'Suscripcion',
                accion: 'update',
                entidadId: (result as any)?.id ?? id,
                detalle: `Suscripcion ${(result as any)?.id ?? id} actualizada`,
                concesionariaId: id,
            });
            res.json(result);
        } catch (error) { next(error); }
    }

    // Facturación
    static async getInvoices(req: Request, res: Response, next: NextFunction) {
        try {
            const { limit, page, sortBy, sortOrder, ...filters } = req.query;
            const result = await getInvoicesUC.execute(filters, { limit, page, sortBy, sortOrder });
            res.json(result);
        } catch (error) { next(error); }
    }

    static async createInvoice(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await createInvoiceUC.execute(req.body);
            await audit({
                entidad: 'Invoice',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `Invoice ${(result as any)?.id} creada`,
            });
            res.status(201).json(result);
        } catch (error) { next(error); }
    }

    static async getInvoiceById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await getInvoiceByIdUC.execute(id);
            res.json(result);
        } catch (error) { next(error); }
    }

    static async registrarPagoInvoice(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await registrarPagoUC.execute(id, req.body);
            await audit({
                entidad: 'Payment',
                accion: 'create',
                entidadId: (result as any)?.id ?? id,
                detalle: `Pago registrado para invoice ${id}`,
            });
            res.json(result);
        } catch (error) { next(error); }
    }
}
