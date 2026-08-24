import { Request, Response, NextFunction } from 'express';
import { context, UserContext } from '../../infrastructure/security/context';
import jwt from 'jsonwebtoken';
import { JWT_ALGORITHMS } from '../../infrastructure/security/jwtOptions';
import { env } from '../../config/env';
import ApiError from '../../utils/ApiError';
import { getClientIp } from '../../utils/clientIp';

export const contextMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    let user: UserContext | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            // algorithms pinneado: sólo HS256, para cerrar la confusión de algoritmo.
            const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: JWT_ALGORITHMS }) as any;
            const userId = Number(decoded.userId ?? decoded.sub ?? decoded.id);
            // Una firma válida no alcanza para ser una SESIÓN: un token de otro
            // propósito firmado con el mismo secreto armaba acá un principal
            // vacío (sin userId, sin tenant y sin roles) que `authenticate`
            // daba por autenticado, y de ahí en más lo único que lo frenaba era
            // la RLS. Sin usuario identificable no hay sesión.
            if (!Number.isInteger(userId) || userId <= 0) throw new Error('token sin usuario');
            user = {
                userId,
                concesionariaId: decoded.concesionariaId || null,
                sucursalId: decoded.sucursalId || null,
                roles: decoded.roles || [],
            };
        } catch (error) {
            // Token invalid or expired - we don't set user but keep going for public routes
            // Routes that require auth will have another middleware to check if user is present in context
        }
    }

    const correlationId = (req.headers['x-correlation-id'] as string) || Math.random().toString(36).substring(7);

    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'];

    context.run({ user, correlationId, ip, userAgent }, () => {
        next();
    });
};
