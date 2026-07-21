import { Request, Response, NextFunction } from 'express';
import { BaseException } from '../../domain/exceptions/BaseException';
import ApiError from '../../utils/ApiError';
import { logger } from '../../infrastructure/logging/logger';
import { env } from '../../config/env';
import { context } from '../../infrastructure/security/context';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    const correlationId = context.get()?.correlationId;

    // 1. Log the error
    logger.error(`${correlationId ? `[${correlationId}] ` : ''}${err.message}`, {
        stack: err.stack,
        url: req.url,
        method: req.method,
    });

    // 2. Determine response status and message
    let statusCode = 500;
    let response = {
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
            ...(err as any).details && { details: (err as any).details },
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

    // Handle Prisma specific errors if they bubble up
    if (err.name === 'PrismaClientKnownRequestError') {
        // P2002 is Unique constraint failed
        if (err.code === 'P2002') {
            statusCode = 400;
            response.error = 'CONFLICT';
            response.message = 'El registro ya existe o viola una restricción de unicidad.';
        }
    }

    res.status(statusCode).json(response);
};
