import { Request, Response, NextFunction } from 'express';
import { NotFoundException } from '../../domain/exceptions/BaseException';

export const notFound = (req: Request, res: Response, next: NextFunction) => {
    next(new NotFoundException(`Route ${req.originalUrl}`));
};
