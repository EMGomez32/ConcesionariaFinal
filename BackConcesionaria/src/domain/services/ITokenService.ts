import { TokenPayload } from '../entities/Auth';

export interface ITokenService {
    generateAccessToken(payload: TokenPayload): string;
    generateRefreshToken(payload: TokenPayload): string;
    verifyRefreshToken(token: string): TokenPayload;
    hashToken(token: string): string;
}
