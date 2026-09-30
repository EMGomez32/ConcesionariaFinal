import { IUsuarioRepository } from '../../../domain/repositories/IUsuarioRepository';
import { NotFoundException } from '../../../domain/exceptions/BaseException';
import { RevokeUserSessions } from '../auth/RevokeUserSessions';

export class DeleteUsuario {
    constructor(
        private readonly usuarioRepository: IUsuarioRepository,
        private readonly revokeSessions: RevokeUserSessions,
    ) { }

    async execute(id: number) {
        const exists = await this.usuarioRepository.findById(id);
        if (!exists) {
            throw new NotFoundException('Usuario');
        }
        const result = await this.usuarioRepository.delete(id);
        // Una baja no puede seguir renovando sesión.
        await this.revokeSessions.execute(id);
        return result;
    }
}
