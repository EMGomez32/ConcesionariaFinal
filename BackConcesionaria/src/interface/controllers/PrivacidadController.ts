import { Request, Response, NextFunction } from 'express';
import {
    informeDelTitular,
    suprimirDatosDelTitular,
    revocarConsentimiento,
    bloquearTitular,
    desbloquearTitular,
} from '../../application/services/privacidad/derechosTitular';
import {
    listarSolicitudesTitular,
    obtenerSolicitudTitular,
    crearSolicitudTitular,
    actualizarSolicitudTitular,
} from '../../application/services/privacidad/solicitudesTitular';
import { ValidationException } from '../../domain/exceptions/BaseException';

/** Id de la URL: entero positivo o 400 (nunca un NaN que llegue a Prisma). */
function idDeRuta(valor: unknown, campo = 'id'): number {
    const id = Number(valor);
    if (!Number.isInteger(id) || id <= 0) {
        throw new ValidationException([{ campo, mensaje: 'Id inválido' }], 'Id inválido');
    }
    return id;
}

export class PrivacidadController {
    /**
     * Informe de acceso (art. 14) como archivo JSON descargable. Va con
     * `no-store`: es la ficha completa de una persona y no tiene que quedar en ninguna
     * caché intermedia ni del navegador.
     */
    static async informe(req: Request, res: Response, next: NextFunction) {
        try {
            const id = idDeRuta(req.params.id);
            const informe = await informeDelTitular(id);
            const fecha = new Date().toISOString().slice(0, 10);
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Content-Disposition', `attachment; filename="datos-titular-${id}-${fecha}.json"`);
            res.json(informe);
        } catch (error) {
            next(error);
        }
    }

    static async suprimir(req: Request, res: Response, next: NextFunction) {
        try {
            const id = idDeRuta(req.params.id);
            res.json(await suprimirDatosDelTitular(id, req.body.motivo));
        } catch (error) {
            next(error);
        }
    }

    static async revocarConsentimiento(req: Request, res: Response, next: NextFunction) {
        try {
            const id = idDeRuta(req.params.id);
            res.json(await revocarConsentimiento(id, req.body?.motivo));
        } catch (error) {
            next(error);
        }
    }

    static async bloquear(req: Request, res: Response, next: NextFunction) {
        try {
            const id = idDeRuta(req.params.id);
            res.json(await bloquearTitular(id, req.body.motivo));
        } catch (error) {
            next(error);
        }
    }

    static async desbloquear(req: Request, res: Response, next: NextFunction) {
        try {
            const id = idDeRuta(req.params.id);
            res.json(await desbloquearTitular(id, req.body.motivo));
        } catch (error) {
            next(error);
        }
    }

    static async listarSolicitudes(req: Request, res: Response, next: NextFunction) {
        try {
            const q = req.query;
            const clienteId = q.clienteId !== undefined ? idDeRuta(q.clienteId, 'clienteId') : undefined;
            const tipos = ['acceso', 'rectificacion', 'supresion', 'bloqueo', 'oposicion'];
            const estados = ['pendiente', 'en_curso', 'resuelta', 'rechazada'];
            res.json(await listarSolicitudesTitular({
                // Whitelist: un valor fuera del enum se ignora (evita el 500 de Prisma).
                tipo: typeof q.tipo === 'string' && tipos.includes(q.tipo) ? q.tipo : undefined,
                estado: typeof q.estado === 'string' && estados.includes(q.estado) ? q.estado : undefined,
                soloAbiertas: q.abiertas === 'true' || q.abiertas === '1',
                clienteId,
                page: Number(q.page) || undefined,
                limit: Number(q.limit) || undefined,
            }));
        } catch (error) {
            next(error);
        }
    }

    static async obtenerSolicitud(req: Request, res: Response, next: NextFunction) {
        try {
            res.json(await obtenerSolicitudTitular(idDeRuta(req.params.id)));
        } catch (error) {
            next(error);
        }
    }

    static async crearSolicitud(req: Request, res: Response, next: NextFunction) {
        try {
            res.status(201).json(await crearSolicitudTitular(req.body));
        } catch (error) {
            next(error);
        }
    }

    static async actualizarSolicitud(req: Request, res: Response, next: NextFunction) {
        try {
            res.json(await actualizarSolicitudTitular(idDeRuta(req.params.id), req.body));
        } catch (error) {
            next(error);
        }
    }
}
