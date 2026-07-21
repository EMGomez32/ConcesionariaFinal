export interface TokenPayload {
    userId: number;
    concesionariaId: number | null;
    sucursalId: number | null;
    roles: string[];
}

export class AuthTokens {
    constructor(
        public readonly accessToken: string,
        public readonly refreshToken: string,
        public readonly user: {
            id: number;
            nombre: string;
            email: string;
            roles: string[];
        }
    ) { }
}

export class RefreshToken {
    constructor(
        public readonly id: number,
        public readonly token: string,
        public readonly usuarioId: number,
        public readonly expiresAt: Date,
        public readonly isRevoked: boolean,
        public readonly createdAt: Date
    ) { }
}
