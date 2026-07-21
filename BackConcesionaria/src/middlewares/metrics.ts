import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime();

    res.on('finish', () => {
        const duration = process.hrtime(start);
        const durationMs = (duration[0] * 1000 + duration[1] / 1e6).toFixed(2);

        logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${durationMs}ms`);

        // In a real app, you'd send this to Prometheus or a similar tool
        // (global as any).metrics = (global as any).metrics || { requests: 0, totalDuration: 0 };
        // (global as any).metrics.requests++;
        // (global as any).metrics.totalDuration += parseFloat(durationMs);
    });

    next();
};

export const getMetrics = () => {
    // This is just a placeholder
    return {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        timestamp: new Date().toISOString()
    };
};
