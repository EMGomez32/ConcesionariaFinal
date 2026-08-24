import { NextFunction, Request, Response } from 'express';
import { audit } from '../../infrastructure/security/audit';
import { context } from '../../infrastructure/security/context';
import * as conversacionService from '../../application/services/conversacionService';

/**
 * Bandeja de WhatsApp: listado de hilos, hilo con sus mensajes, envío (encolado)
 * y gestión (cerrar/asignar/registrar como consulta).
 *
 * Controllers finos: toda la lógica —incluida la visibilidad del vendedor puro,
 * que se aplica en el service para que valga igual en el listado, el detalle y
 * el envío— vive en conversacionService.
 */
export class ConversacionController {
    /** GET /conversaciones — bandeja paginada. */
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { estado, asignadoAId, sinResponder, q, page, limit } = req.query;
            const resultado = await conversacionService.listar({
                estado: estado as string,
                asignadoAId: asignadoAId as string,
                sinResponder: sinResponder as string,
                q: q as string,
                page: page as string,
                limit: limit as string,
            });
            res.json(resultado);
        } catch (error) {
            next(error);
        }
    }

    /** GET /conversaciones/:id — hilo + últimos 100 mensajes. Marca leído. */
    static async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const conversacion = await conversacionService.detalle(id);
            res.json(conversacion);
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /conversaciones/:id/mensajes — encola un saliente.
     * NO envía en el request: devuelve el mensaje en estado `pendiente` con su
     * turno (`enviarAt`) reservado. El worker lo despacha después.
     */
    static async crearMensaje(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const usuarioId = context.getUser()?.userId ?? null;
            const mensaje = await conversacionService.encolarSaliente(id, req.body.contenido, usuarioId);
            res.status(201).json(mensaje);
        } catch (error) {
            next(error);
        }
    }

    /** PATCH /conversaciones/:id — cerrar/archivar/reabrir y asignar. */
    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const conversacion = await conversacionService.actualizar(id, req.body);
            await audit({
                entidad: 'Conversacion',
                accion: 'update',
                entidadId: id,
                detalle: `Conversación ${id} actualizada`,
            });
            res.json(conversacion);
        } catch (error) {
            next(error);
        }
    }

    /** POST /conversaciones/:id/registrar-consulta — convierte el hilo en lead. */
    static async registrarConsulta(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const resultado = await conversacionService.registrarConsulta(id);
            await audit({
                entidad: 'Conversacion',
                accion: 'update',
                entidadId: id,
                detalle: `Conversación ${id} registrada como consulta (cliente ${resultado.clienteId})`,
            });
            res.json(resultado);
        } catch (error) {
            next(error);
        }
    }
}
