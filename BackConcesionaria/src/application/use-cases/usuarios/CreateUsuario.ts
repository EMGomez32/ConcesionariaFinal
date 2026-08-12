import { IUsuarioRepository } from '../../../domain/repositories/IUsuarioRepository';
import { BaseException } from '../../../domain/exceptions/BaseException';
import { assertMismoTenant } from '../../../infrastructure/security/tenantGuard';
import { assertRolesAsignables, assertLimiteUsuarios } from '../../../infrastructure/security/usuarioPolicy';
import bcrypt from 'bcryptjs';

export class CreateUsuario {
    constructor(private readonly usuarioRepository: IUsuarioRepository) { }

    async execute(data: any) {
        const { password, ...userData } = data;
        if (!password) {
            throw new BaseException(400, 'La contraseña es obligatoria', 'VALIDATION_ERROR');
        }
        if (password.length < 6) {
            throw new BaseException(400, 'La contraseña debe tener al menos 6 caracteres', 'VALIDATION_ERROR');
        }
        if (!userData.email) {
            throw new BaseException(400, 'El email es obligatorio', 'VALIDATION_ERROR');
        }
        if (!userData.concesionariaId) {
            throw new BaseException(400, 'concesionariaId es obligatorio', 'VALIDATION_ERROR');
        }

        // Seguridad: un admin de tenant NO puede asignar super_admin (escalada de
        // privilegios que rompería el aislamiento multi-tenant). Sólo un super_admin
        // puede otorgarlo. El candado real vive acá, no en el schema Zod.
        await assertRolesAsignables(userData.roleIds);

        // Cupo de usuarios de la concesionaria (lo fija el super_admin). Un admin no
        // puede crear por encima del límite; super_admin no está topeado.
        await assertLimiteUsuarios(userData.concesionariaId);

        // La sucursal asignada tiene que ser de la concesionaria del usuario: sin
        // esto un admin podría asignar a alguien a una sucursal de otro tenant.
        await assertMismoTenant('sucursal', userData.sucursalId, userData.concesionariaId);

        // HU-09: validar unicidad de email. Ahora el email es @unique GLOBAL (no por
        // tenant), así que el pre-chequeo también es global: un email que ya existe en
        // OTRA concesionaria debe cortar acá con un 409 amistoso, no reventar en el
        // INSERT con un P2002 crudo.
        const dup = await this.usuarioRepository.findByEmail(userData.email);
        if (dup) {
            throw new BaseException(
                409,
                `Ya existe un usuario con el email ${userData.email}`,
                'EMAIL_DUPLICATED'
            );
        }

        const passwordHash = await bcrypt.hash(password, 10);
        return this.usuarioRepository.create({ ...userData, passwordHash });
    }
}
