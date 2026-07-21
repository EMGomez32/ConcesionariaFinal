import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import ApiError from '../utils/ApiError';

export const validate = (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) {
        return next();
    }

    const message = errors.array()
        .map((error: any) => `${error.path}: ${error.msg}`)
        .join(', ');

    throw new ApiError(400, message, 'VALIDATION_ERROR');
};
