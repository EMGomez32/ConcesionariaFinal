import { Request, Response, NextFunction } from 'express';
import * as precioAutorizacion from '../../application/services/precioAutorizacion';

/**
 * Bandeja de autorizaciones del precio mínimo de venta.
 *
 * El controller es fino a propósito: todo el criterio (quién ve qué, qué valor
 * viaja, cuándo vence) vive en `precioAutorizacion.ts`, porque el mismo flujo lo
 * consume además la ficha del vehículo y —a futuro— el cierre de una atención.
 * Si el recorte viviera acá, entrar por otra ruta lo saltearía.
 */
export class PrecioMinimoController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const estado = req.query.estado ? String(req.query.estado) : undefined;
            const vehiculoId = req.query.vehiculoId ? Number(req.query.vehiculoId) : undefined;
            const items = await precioAutorizacion.listar({
                estado,
                vehiculoId: Number.isInteger(vehiculoId) && (vehiculoId as number) > 0 ? vehiculoId : undefined,
            });
            res.json({ results: items, totalResults: items.length });
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const solicitud = await precioAutorizacion.solicitar({
                vehiculoId: Number(req.body.vehiculoId),
                atencionId: req.body.atencionId ?? null,
                motivo: req.body.motivo ?? null,
            });
            res.status(201).json(solicitud);
        } catch (error) {
            next(error);
        }
    }

    static async resolver(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const resuelta = await precioAutorizacion.resolver(id, {
                autorizar: Boolean(req.body.autorizar),
                precioAutorizado: req.body.precioAutorizado ?? null,
                respuesta: req.body.respuesta ?? null,
                horasVigencia: req.body.horasVigencia ?? null,
            });
            res.json(resuelta);
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /precio-minimo/vehiculo/:vehiculoId → el valor, si el que pregunta tiene
     * una autorización vigente. Es el endpoint que consulta el botón "Ver piso" del
     * mostrador; devuelve 200 con `{ autorizado: false }` en vez de 403 para que la
     * pantalla pueda ofrecer el pedido sin tratar la negativa como un error.
     */
    static async vigentePorVehiculo(req: Request, res: Response, next: NextFunction) {
        try {
            const vehiculoId = parseInt(req.params.vehiculoId as string, 10);
            const vigente = await precioAutorizacion.autorizacionVigente(vehiculoId);
            if (!vigente) return res.json({ autorizado: false, vehiculoId });
            res.json({ autorizado: true, ...vigente });
        } catch (error) {
            next(error);
        }
    }
}
