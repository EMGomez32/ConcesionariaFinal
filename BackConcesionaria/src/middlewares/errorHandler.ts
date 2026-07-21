import { Request, Response, NextFunction } from 'express';
import config from '../config';
import logger from '../utils/logger';
import ApiResponse from '../utils/ApiResponse';
import ApiError from '../utils/ApiError';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    let { statusCode, message, code } = err;

    // Log all errors for debugging
    if (!(err instanceof ApiError)) {
        logger.error('Error no controlado:', {
            message: err.message,
            stack: err.stack,
            name: err.name
        });
    }

    if (!(err instanceof ApiError)) {
        statusCode = 500;
        message = config.env === 'development' ? err.message : 'Error interno del servidor';
        code = 'INTERNAL_ERROR';
    }

    res.status(statusCode).send(ApiResponse.error(message, statusCode, code));
};
