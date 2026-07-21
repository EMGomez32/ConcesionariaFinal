import { Request, Response, NextFunction } from 'express';
import { context } from '../../infrastructure/security/context';
import { UnauthorizedException } from '../../domain/exceptions/BaseException';

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
    const user = context.getUser();
    if (!user) {
        throw new UnauthorizedException('Authentication required');
    }
    next();
};
