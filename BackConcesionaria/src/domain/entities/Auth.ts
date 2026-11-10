export interface TokenPayload {
    userId: number;
    concesionariaId: number | null;
    sucursalId: number | null;
    roles: string[];
    /** El rol exige 2FA y el usuario no lo activó: la sesión sólo puede configurarlo. */
    mfaPending?: boolean;
    /**
     * Id de la sesión (la `familia` de sus refresh tokens). Va en el access token para que
     * una request pueda identificar SU sesión sin tener el refresh: la web no lo tiene, vive
     * en la cookie httpOnly (ver ConservarSesionActual). No es un secreto ni sirve para
     * renovar nada: sólo nombra la sesión.
     */
    sid?: string;
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
        public readonly createdAt: Date,
        /** Sesión (login) a la que pertenece: la heredan todas sus rotaciones. */
        public readonly familia: string,
        /** Cuándo fue el login de esa sesión: lo que la corta a los SESION_MAX_DIAS. */
        public readonly sesionIniciadaAt: Date,
    ) { }
}
