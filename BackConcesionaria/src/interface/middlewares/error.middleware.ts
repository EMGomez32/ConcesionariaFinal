import { Request, Response, NextFunction } from 'express';
import { BaseException, DetalleDeError } from '../../domain/exceptions/BaseException';
import ApiError from '../../utils/ApiError';
import { logger } from '../../infrastructure/logging/logger';
import { env } from '../../config/env';
import { context } from '../../infrastructure/security/context';
import { urlParaLog } from './requestLogger.middleware';

const esErrorDePrisma = (err: any): boolean =>
    typeof err?.name === 'string' && err.name.startsWith('PrismaClient');

interface RespuestaDeError {
    error: string;
    message: string;
    correlationId?: string;
    stack?: string;
    details?: DetalleDeError;
}

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    const correlationId = context.get()?.correlationId;

    // 1. Log del error. La URL va REDACTADA (urlParaLog): las búsquedas llevan DNI, teléfonos
    // y emails en el query string, y `req.url` los escribía tal cual. En producción, de un
    // error de Prisma se loguea el código y el modelo, no el mensaje: el de validación
    // (PrismaClientValidationError) reproduce los argumentos de la consulta, con sus valores.
    const prefijo = correlationId ? `[${correlationId}] ` : '';
    if (env.NODE_ENV === 'production' && esErrorDePrisma(err)) {
        logger.error(`${prefijo}${err.name}${err.code ? ` ${err.code}` : ''}${err.meta?.modelName ? ` (${err.meta.modelName})` : ''}`, {
            url: urlParaLog(req.originalUrl ?? req.url),
            method: req.method,
        });
    } else {
        logger.error(`${prefijo}${err.message}`, {
            stack: err.stack,
            url: urlParaLog(req.originalUrl ?? req.url),
            method: req.method,
        });
    }

    // 2. Determine response status and message
    // El tipo es explícito (y no inferido del literal) porque la rama de
    // BaseException agrega `details`: con el tipo inferido del primer objeto, ese
    // campo sólo compilaba escondiéndolo detrás de un `as any`.
    let statusCode = 500;
    let response: RespuestaDeError = {
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Ha ocurrido un error inesperado.',
        correlationId,
        ...(env.NODE_ENV === 'development' && { stack: err.stack }),
    };

    if (err instanceof BaseException) {
        statusCode = err.statusCode;
        response = {
            error: err.errorCode,
            message: err.message,
            correlationId,
            ...(err.details ? { details: err.details } : {}),
        };
    }

    // El middleware `validate` (express-validator) lanza ApiError, que es una
    // clase distinta de BaseException. Sin esta rama, toda validación fallida
    // terminaba en el 500 genérico en lugar de un 400 con el detalle del campo.
    if (err instanceof ApiError) {
        statusCode = err.statusCode;
        response = {
            error: err.code,
            message: err.message,
            correlationId,
        };
    }

    // Errores CONOCIDOS de Prisma que burbujean sin envolver: mapearlos a
    // respuestas HTTP limpias en vez del 500 genérico. Complementa la validación
    // Zod (que ataja la FORMA del input) atajando las violaciones a nivel base.
    // La mayoría de los use-cases ya chequean existencia antes (NotFoundException),
    // así que esto es la red de contención para lo que se les escapa.
    if (err?.name === 'PrismaClientKnownRequestError' || (typeof err?.code === 'string' && /^P\d{4}$/.test(err.code))) {
        const target = Array.isArray(err?.meta?.target) ? err.meta.target.join(', ') : err?.meta?.target;
        const PRISMA_MAP: Record<string, { status: number; error: string; message: string }> = {
            // Unique constraint. Se mantiene en 400 (status previo) para no cambiar
            // el contrato existente; sólo se mejora el mensaje con el campo en conflicto.
            P2002: { status: 400, error: 'CONFLICT', message: target ? `Ya existe un registro con ese ${target}.` : 'El registro ya existe (viola una restricción de unicidad).' },
            P2025: { status: 404, error: 'NOT_FOUND', message: 'El registro solicitado no existe.' },
            P2003: { status: 400, error: 'FK_CONSTRAINT', message: 'La operación referencia un registro que no existe.' },
            P2000: { status: 400, error: 'VALUE_TOO_LONG', message: 'Un valor supera la longitud permitida para el campo.' },
            P2011: { status: 400, error: 'NULL_CONSTRAINT', message: 'Falta completar un campo obligatorio.' },
            P2014: { status: 400, error: 'RELATION_VIOLATION', message: 'La operación viola una relación requerida entre registros.' },
        };
        const mapped = PRISMA_MAP[err.code as string];
        if (mapped) {
            statusCode = mapped.status;
            response = { error: mapped.error, message: mapped.message, correlationId };
        }
    }

    res.status(statusCode).json(response);
};
