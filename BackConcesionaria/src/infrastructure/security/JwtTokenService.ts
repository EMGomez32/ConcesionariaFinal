import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { ITokenService } from '../../domain/services/ITokenService';
import { TokenPayload } from '../../domain/entities/Auth';
import config from '../../config';

export class JwtTokenService implements ITokenService {
    generateAccessToken(payload: TokenPayload): string {
        return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.accessExpirationMinutes as any });
    }

    generateRefreshToken(payload: TokenPayload): string {
        // jti único garantiza que dos refresh tokens emitidos para el mismo
        // usuario en el mismo segundo no colisionen al hashearse y violar
        // el `@unique` de RefreshToken.token.
        return jwt.sign(payload, config.jwt.refreshSecret, {
            expiresIn: config.jwt.refreshExpirationDays as any,
            jwtid: crypto.randomUUID(),
        });
    }

    verifyRefreshToken(token: string): TokenPayload {
        return jwt.verify(token, config.jwt.refreshSecret) as TokenPayload;
    }

    hashToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }
}
