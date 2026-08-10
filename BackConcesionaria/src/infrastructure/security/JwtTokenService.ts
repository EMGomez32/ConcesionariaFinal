import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { ITokenService } from '../../domain/services/ITokenService';
import { TokenPayload } from '../../domain/entities/Auth';
import config from '../../config';
import { JWT_ALGORITHM, JWT_ALGORITHMS } from './jwtOptions';

export class JwtTokenService implements ITokenService {
    generateAccessToken(payload: TokenPayload): string {
        return jwt.sign(payload, config.jwt.secret, {
            expiresIn: config.jwt.accessExpirationMinutes as any,
            algorithm: JWT_ALGORITHM,
        });
    }

    generateRefreshToken(payload: TokenPayload): string {
        // jti único garantiza que dos refresh tokens emitidos para el mismo
        // usuario en el mismo segundo no colisionen al hashearse y violar
        // el `@unique` de RefreshToken.token.
        return jwt.sign(payload, config.jwt.refreshSecret, {
            expiresIn: config.jwt.refreshExpirationDays as any,
            jwtid: crypto.randomUUID(),
            algorithm: JWT_ALGORITHM,
        });
    }

    verifyRefreshToken(token: string): TokenPayload {
        // algorithms pinneado: no aceptar tokens firmados con otro alg (ni alg:none).
        return jwt.verify(token, config.jwt.refreshSecret, { algorithms: JWT_ALGORITHMS }) as TokenPayload;
    }

    hashToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }
}
