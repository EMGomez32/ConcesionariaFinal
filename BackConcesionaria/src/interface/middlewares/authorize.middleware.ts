import { Request, Response, NextFunction } from 'express';
import { context } from '../../infrastructure/security/context';
import { ForbiddenException } from '../../domain/exceptions/BaseException';

export const authorize = (...roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = context.getUser();
        if (!user) {
            throw new ForbiddenException('User context missing');
        }

        const hasRole = roles.some(role => user.roles.includes(role));
        // super_admin bypasses all role requirements.
        if (!hasRole && !user.roles.includes('super_admin')) {
            throw new ForbiddenException(`Access denied. Required roles: ${roles.join(', ')}`);
        }
        next();
    };
};
