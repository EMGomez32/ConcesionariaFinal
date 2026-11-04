import bcrypt from 'bcryptjs';
import { IUsuarioRepository } from '../../../domain/repositories/IUsuarioRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import { UpdateUsuario } from './UpdateUsuario';

/**
 * Edición del perfil propio (nombre y email). Cambiar el EMAIL exige la contraseña
 * actual: el email es el destino del "olvidé mi contraseña", así que quien lo cambia
 * sin conocer la clave (sesión abierta olvidada, token robado) toma la cuenta. Sólo
 * el nombre no la pide.
 *
 * Si cambia el email se cierran las demás sesiones (lo hace UpdateUsuario); la
 * actual se conserva si el cliente manda su refresh token.
 */
export class UpdateMyProfile {
    constructor(
        private readonly repository: IUsuarioRepository,
        private readonly updateUsuario: UpdateUsuario,
    ) { }

    async execute(
        usuarioId: number,
        input: { nombre?: string; email?: string; currentPassword?: string },
        keepRefreshToken?: string | null,
    ) {
        const { nombre, email, currentPassword } = input;

        const actual: any = await this.repository.findById(usuarioId);
        if (!actual) throw new NotFoundException('Usuario');

        const cambiaEmail =
            !!email && email.trim().toLowerCase() !== String(actual.email ?? '').trim().toLowerCase();

        if (cambiaEmail) {
            if (!currentPassword) {
                throw new BaseException(
                    400,
                    'Para cambiar el email ingresá tu contraseña actual',
                    'CURRENT_PASSWORD_REQUIRED',
                );
            }
            const ok = await bcrypt.compare(currentPassword, actual.passwordHash || '');
            if (!ok) {
                throw new BaseException(400, 'La contraseña actual es incorrecta', 'INVALID_CURRENT_PASSWORD');
            }
        }

        // Si el email no cambia no se manda: evita revocar sesiones (y el chequeo de
        // unicidad) por reenviar el mismo valor, que es lo que hace el formulario.
        return this.updateUsuario.execute(
            usuarioId,
            { nombre, ...(cambiaEmail ? { email } : {}) },
            keepRefreshToken,
        );
    }
}
