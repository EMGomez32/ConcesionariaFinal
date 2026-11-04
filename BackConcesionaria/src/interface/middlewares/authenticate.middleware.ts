import { Request, Response, NextFunction } from 'express';
import { context } from '../../infrastructure/security/context';
import { BaseException, UnauthorizedException } from '../../domain/exceptions/BaseException';

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
    const user = context.getUser();
    if (!user) {
        throw new UnauthorizedException('Authentication required');
    }
    // Sesión de un usuario cuyo rol EXIGE 2FA y todavía no lo activó: sólo puede configurarlo (y salir).
    // Sin esto, "obligatorio" sería sólo una sugerencia de la pantalla.
    if (user.mfaPending && !(req.originalUrl.split('?')[0]).startsWith('/api/auth/')) {
        throw new BaseException(403, 'Tu rol exige verificación en dos pasos. Activá el 2FA para continuar.', 'MFA_ENROLLMENT_REQUIRED');
    }
    next();
};
