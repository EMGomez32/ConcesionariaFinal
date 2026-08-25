import { NextFunction, Request, Response } from 'express';
import { audit } from '../../infrastructure/security/audit';
import { context } from '../../infrastructure/security/context';
import * as conversacionService from '../../application/services/conversacionService';

/**
 * Bandeja multi-canal: listado de hilos, hilo con sus mensajes, envío (encolado)
 * y gestión (cerrar/asignar/registrar como consulta).
 *
 * Una sola bandeja para WhatsApp, los DM de Instagram y Messenger y los
 * comentarios de Instagram/Facebook: el canal es un filtro y una etiqueta, no
 * una pantalla aparte. El endpoint de envío tampoco cambia de forma — el front
 * manda texto y el service sabe por dónde sale.
 *
 * Controllers finos: toda la lógica —incluida la visibilidad del vendedor puro,
 * que se aplica en el service para que valga igual en el listado, el detalle y
 * el envío— vive en conversacionService.
 */
export class ConversacionController {
    /** GET /conversaciones — bandeja paginada (todos los canales, o uno). */
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { estado, canal, asignadoAId, sinResponder, q, page, limit } = req.query;
            const resultado = await conversacionService.listar({
                estado: estado as string,
                canal: canal as string,
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
     * turno (`enviarAt`) reservado. El worker lo despacha por el canal del hilo.
     *
     * Lo que impide enviar sale como 409 con el motivo ya redactado para mostrar
     * (número pausado, integración desactivada, ventana de 24 h de Meta vencida):
     * nunca un 500 ni un código de error de Meta.
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

    /**
     * POST /conversaciones/:id/registrar-consulta — convierte el hilo en lead.
     *
     * El body es OPCIONAL y trae lo que el vendedor completó a mano (nombre y
     * teléfono): en los canales de Meta el hilo puede no tener ninguno de los
     * dos, y sin eso el cliente nacía con el id opaco de Meta por nombre.
     */
    static async registrarConsulta(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const { nombre, telefono } = (req.body ?? {}) as { nombre?: string; telefono?: string };
            const resultado = await conversacionService.registrarConsulta(id, { nombre, telefono });
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
