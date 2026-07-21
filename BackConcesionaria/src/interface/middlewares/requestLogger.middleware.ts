import { Request, Response, NextFunction } from 'express';
import { logger } from '../../infrastructure/logging/logger';
import { context } from '../../infrastructure/security/context';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`, {
            correlationId: context.getCorrelationId(),
            tenantId: context.getTenantId(),
            userId: context.getUser()?.userId
        });
    });
    next();
};
