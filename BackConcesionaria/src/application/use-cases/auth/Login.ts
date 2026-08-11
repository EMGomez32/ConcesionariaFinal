import bcrypt from 'bcryptjs';
import { ITokenService } from '../../../domain/services/ITokenService';
import { IRefreshTokenRepository } from '../../../domain/repositories/IRefreshTokenRepository';
import { UnauthorizedException, ForbiddenException } from '../../../domain/exceptions/BaseException';
import { withAuthBypass } from '../../../infrastructure/database/unitOfWork';
import config from '../../../config';

export class Login {
    constructor(
        private readonly tokenService: ITokenService,
        private readonly refreshTokenRepository: IRefreshTokenRepository
    ) { }

    async execute(email: string, pass: string) {
        // withAuthBypass: el login es legítimamente cross-tenant (busca por email sin
        // saber el tenant). Bajo el rol app_rw la RLS filtraría `usuarios` a 0 filas;
        // por eso se saltea explícito. `deletedAt: null` a mano (no pasa por la extensión).
        const usuario = await withAuthBypass((tx) => tx.usuario.findFirst({
            where: { email, deletedAt: null },
            include: {
                roles: { include: { rol: true } }
            }
        }));

        if (!usuario || !usuario.passwordHash) {
            throw new UnauthorizedException('Credenciales inválidas');
        }

        const isMatch = await bcrypt.compare(pass, usuario.passwordHash);
        if (!isMatch) throw new UnauthorizedException('Credenciales inválidas');

        if (!usuario.activo) throw new ForbiddenException('Usuario inactivo');

        const roles = usuario.roles
            .filter(r => !r.deletedAt && !r.rol.deletedAt)
            .map(r => r.rol.nombre);

        const payload = {
            userId: usuario.id,
            concesionariaId: usuario.concesionariaId,
            sucursalId: usuario.sucursalId,
            roles
        };

        const access = this.tokenService.generateAccessToken(payload);
        const refresh = this.tokenService.generateRefreshToken(payload);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + parseInt(config.jwt.refreshExpirationDays));

        await this.refreshTokenRepository.create({
            token: this.tokenService.hashToken(refresh),
            usuarioId: usuario.id,
            expiresAt
        });

        return {
            user: {
                id: usuario.id,
                nombre: usuario.nombre,
                email: usuario.email,
                roles,
                concesionariaId: usuario.concesionariaId,
                sucursalId: usuario.sucursalId
            },
            tokens: { access, refresh }
        };
    }
}
