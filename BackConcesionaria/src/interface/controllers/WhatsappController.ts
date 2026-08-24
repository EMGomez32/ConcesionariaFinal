import { NextFunction, Request, Response } from 'express';
import prisma from '../../infrastructure/database/prisma';
import { audit } from '../../infrastructure/security/audit';
import { resolveConcesionariaId } from '../../infrastructure/security/resolveConcesionariaId';
import { BaseException, NotFoundException } from '../../domain/exceptions/BaseException';
import { whatsappManager } from '../../application/services/whatsappManager';

/**
 * Cuentas de WhatsApp del tenant (Ajustes → WhatsApp). Admin-only (en el router).
 *
 * Sin capa repo: el modelo es chico y la extensión de Prisma ya scopea tenant +
 * soft-delete. Lo particular acá es que el ESTADO REAL no está en la base sino en
 * el socket que vive en el proceso (whatsappManager): la fila es un reflejo que
 * puede quedar viejo si el proceso reinició. Por eso toda respuesta prefiere el
 * estado vivo y cae a la fila sólo cuando no hay socket.
 */

interface EstadoRespuesta {
    estado: string;
    qr: string | null;
    numero: string | null;
    error: string | null;
}

/** Estado vivo si hay socket; si no, lo último que quedó persistido. */
const estadoDe = (cuenta: { id: number; estado: string; numero: string | null; ultimoError: string | null }): EstadoRespuesta => {
    const vivo = whatsappManager.estado(cuenta.id);
    if (vivo) return { estado: vivo.estado, qr: vivo.qr, numero: vivo.numero, error: vivo.error };
    // Sin socket en este proceso: el QR no existe (es de vida corta y no se persiste).
    return { estado: cuenta.estado, qr: null, numero: cuenta.numero, error: cuenta.ultimoError };
};

const buscarCuenta = async (id: number) => {
    const cuenta = await prisma.whatsappCuenta.findFirst({ where: { id } });
    if (!cuenta) throw new NotFoundException('Cuenta de WhatsApp');
    return cuenta;
};

export class WhatsappController {
    /** GET /whatsapp/cuentas — listado con el estado vivo y si hay sesión en disco. */
    static async getCuentas(req: Request, res: Response, next: NextFunction) {
        try {
            const cuentas = await prisma.whatsappCuenta.findMany({ orderBy: { id: 'asc' } });
            res.json(cuentas.map((cuenta) => ({
                id: cuenta.id,
                alias: cuenta.alias,
                numero: cuenta.numero,
                estado: estadoDe(cuenta).estado,
                activa: cuenta.activa,
                ultimoError: cuenta.ultimoError,
                saludEstado: cuenta.saludEstado,
                // Con sesión en disco la cuenta reconecta sola; sin ella hay que
                // escanear un QR. Es lo que decide qué botón muestra el panel.
                tieneSesion: whatsappManager.tieneSesion(cuenta.id),
            })));
        } catch (error) {
            next(error);
        }
    }

    /** POST /whatsapp/cuentas — da de alta el número (todavía sin vincular). */
    static async createCuenta(req: Request, res: Response, next: NextFunction) {
        try {
            const concesionariaId = resolveConcesionariaId(req.body?.concesionariaId);
            // Sólo es null para un super_admin que no eligió tenant (el admin trae
            // el suyo del token): sin esto Prisma tira "concesionaria is missing".
            if (concesionariaId == null) {
                throw new BaseException(400, 'Elegí una concesionaria para crear la cuenta de WhatsApp', 'VALIDATION_ERROR');
            }
            const { alias } = req.body;
            const cuenta = await prisma.whatsappCuenta.create({
                data: { concesionariaId, alias },
            });
            await audit({
                entidad: 'WhatsappCuenta',
                accion: 'create',
                entidadId: cuenta.id,
                detalle: `Cuenta de WhatsApp "${alias}" creada`,
                concesionariaId,
            });
            res.status(201).json(cuenta);
        } catch (error) {
            next(error);
        }
    }

    /** POST /whatsapp/cuentas/:id/conectar — levanta el socket y empieza el QR. */
    static async conectar(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const cuenta = await buscarCuenta(id);
            if (!cuenta.activa) {
                throw new BaseException(409, 'La cuenta está desactivada', 'WHATSAPP_CUENTA_INACTIVA');
            }
            const proveedor = await whatsappManager.conectar(id, cuenta.concesionariaId);
            await audit({
                entidad: 'WhatsappCuenta',
                accion: 'update',
                entidadId: id,
                detalle: `Cuenta de WhatsApp "${cuenta.alias}": conexión solicitada`,
                concesionariaId: cuenta.concesionariaId,
            });
            res.json({ estado: proveedor.estado, qr: proveedor.qr, numero: proveedor.numero, error: proveedor.error });
        } catch (error) {
            next(error);
        }
    }

    /** POST /whatsapp/cuentas/:id/desconectar — cierra el socket, conserva la sesión. */
    static async desconectar(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const cuenta = await buscarCuenta(id);
            const proveedor = await whatsappManager.desconectar(id);
            if (!proveedor) {
                // No había socket (típico después de un reinicio): la fila podía
                // haber quedado marcada como conectada. Se sincera acá.
                const actualizada = await prisma.whatsappCuenta.update({
                    where: { id },
                    data: { estado: 'desconectado' },
                });
                res.json({ estado: actualizada.estado, qr: null, numero: actualizada.numero, error: actualizada.ultimoError });
                return;
            }
            await audit({
                entidad: 'WhatsappCuenta',
                accion: 'update',
                entidadId: id,
                detalle: `Cuenta de WhatsApp "${cuenta.alias}": desconectada`,
                concesionariaId: cuenta.concesionariaId,
            });
            res.json({ estado: proveedor.estado, qr: proveedor.qr, numero: proveedor.numero, error: proveedor.error });
        } catch (error) {
            next(error);
        }
    }

    /** POST /whatsapp/cuentas/:id/cerrar-sesion — desvincula: el próximo inicio pide QR. */
    static async cerrarSesion(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const cuenta = await buscarCuenta(id);
            const proveedor = await whatsappManager.cerrarSesion(id);
            // Sin socket vivo, la sesión en disco igual se da por terminada en la
            // fila; el authDir lo purga el cliente la próxima vez que se cree.
            const actualizada = await prisma.whatsappCuenta.update({
                where: { id },
                data: { estado: 'desconectado', numero: null, ultimoError: null },
            });
            await audit({
                entidad: 'WhatsappCuenta',
                accion: 'update',
                entidadId: id,
                detalle: `Cuenta de WhatsApp "${cuenta.alias}": sesión cerrada (hay que volver a vincular)`,
                concesionariaId: cuenta.concesionariaId,
            });
            res.json({
                estado: proveedor?.estado ?? actualizada.estado,
                qr: null,
                numero: null,
                error: null,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /whatsapp/cuentas/:id/estado — lo poletea el panel mientras muestra el
     * QR (el data-URL sólo existe en memoria, así que se sirve desde el socket).
     */
    static async estado(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const cuenta = await buscarCuenta(id);
            res.json(estadoDe(cuenta));
        } catch (error) {
            next(error);
        }
    }
}
