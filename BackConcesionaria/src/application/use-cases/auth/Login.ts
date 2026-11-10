import bcrypt from 'bcryptjs';
import { ITokenService } from '../../../domain/services/ITokenService';
import { IRefreshTokenRepository } from '../../../domain/repositories/IRefreshTokenRepository';
import { UnauthorizedException, ForbiddenException } from '../../../domain/exceptions/BaseException';
import { withAuthBypass } from '../../../infrastructure/database/unitOfWork';
import { emitirMfaToken } from '../../../infrastructure/security/mfaToken';
import { emitirSesion } from './emitirSesion';
import { costoBcrypt, hashearContrasena, necesitaRehash } from '../../../infrastructure/security/passwordHash';

// Hash descartable para gastar el MISMO tiempo de bcrypt cuando el email no existe:
// sin esto, 'no existe' respondía en milisegundos y 'existe con clave mala' en ~100 ms,
// y esa diferencia enumera las cuentas registradas. Con el mismo costo que los hashes
// nuevos, si no la diferencia de tiempo vuelve a delatar cuáles existen.
const DUMMY_HASH = bcrypt.hashSync('autenza-dummy-password-no-usar', costoBcrypt());

export class Login {
    constructor(
        private readonly tokenService: ITokenService,
        private readonly refreshTokenRepository: IRefreshTokenRepository
    ) { }

    async execute(email: string, pass: string) {
        // withAuthBypass: el login es legítimamente cross-tenant (busca por email sin
        // saber el tenant). Bajo el rol app_rw la RLS filtraría `usuarios` a 0 filas;
        // por eso se saltea explícito. `deletedAt: null` a mano (no pasa por la extensión).
        // El email es @unique global (schema): este findFirst devuelve a lo sumo 1 fila.
        // `orderBy: { id: 'asc' }` es defensa en profundidad: si alguna vez se regresara
        // a un unique por-tenant, el login seguiría resolviendo de forma determinística.
        const usuario = await withAuthBypass((tx) => tx.usuario.findFirst({
            where: { email, deletedAt: null },
            orderBy: { id: 'asc' },
            include: {
                roles: { include: { rol: true } }
            }
        }));

        if (!usuario || !usuario.passwordHash) {
            await bcrypt.compare(pass, DUMMY_HASH);
            throw new UnauthorizedException('Credenciales inválidas');
        }

        const isMatch = await bcrypt.compare(pass, usuario.passwordHash);
        if (!isMatch) throw new UnauthorizedException('Credenciales inválidas');

        if (!usuario.activo) throw new ForbiddenException('Usuario inactivo');

        // APP-13: un hash con costo viejo se re-hashea ahora, que la contraseña ya se
        // verificó. Si falla no se corta el login: queda para el próximo.
        if (necesitaRehash(usuario.passwordHash)) {
            try {
                const passwordHash = await hashearContrasena(pass);
                await withAuthBypass((tx) => tx.usuario.update({ where: { id: usuario.id }, data: { passwordHash } }));
            } catch {
                /* se reintenta en el próximo login */
            }
        }

        // 2FA: la contraseña sola NO alcanza. Se devuelve un token de 5 min que sólo sirve para
        // /auth/login/2fa; no hay sesión (ni refresh token) hasta presentar el segundo factor.
        if (usuario.totpEnabled) {
            return { requires2fa: true as const, mfaToken: emitirMfaToken(usuario.id) };
        }

        return emitirSesion(usuario, this.tokenService, this.refreshTokenRepository);
    }
}
