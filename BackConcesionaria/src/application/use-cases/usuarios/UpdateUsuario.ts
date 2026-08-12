import { IUsuarioRepository } from '../../../domain/repositories/IUsuarioRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import { assertMismoTenant } from '../../../infrastructure/security/tenantGuard';
import { assertRolesAsignables } from '../../../infrastructure/security/usuarioPolicy';
import bcrypt from 'bcryptjs';

export class UpdateUsuario {
    constructor(private readonly usuarioRepository: IUsuarioRepository) { }

    async execute(id: number, data: any) {
        const exists: any = await this.usuarioRepository.findById(id);
        if (!exists) {
            throw new NotFoundException('Usuario');
        }

        const { password, ...updateData } = data;

        // Seguridad: editar a OTRO usuario tampoco puede escalar a super_admin. El
        // controller ya strippea roleIds cuando te editás a vos mismo (anti
        // auto-lockout); esto cubre el vector de asignárselo a un tercero.
        await assertRolesAsignables(updateData.roleIds);

        // Reasignar la sucursal no puede sacar al usuario de su tenant.
        await assertMismoTenant('sucursal', updateData.sucursalId, exists.concesionariaId);

        // HU-11: si cambia el email, validar unicidad antes de tirar P2002. El email
        // es @unique GLOBAL, así que el chequeo es global (no acotado al tenant).
        if (updateData.email && updateData.email !== exists.email) {
            const dup = await this.usuarioRepository.findByEmail(updateData.email);
            if (dup && dup.id !== id) {
                throw new BaseException(
                    409,
                    `Ya existe otro usuario con el email ${updateData.email}`,
                    'EMAIL_DUPLICATED'
                );
            }
        }

        if (password) {
            (updateData as any).passwordHash = await bcrypt.hash(password, 10);
        }

        return this.usuarioRepository.update(id, updateData);
    }
}
