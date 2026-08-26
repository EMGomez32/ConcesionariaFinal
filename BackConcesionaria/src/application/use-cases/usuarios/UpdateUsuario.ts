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
        //
        // El tenant contra el que se valida es el DESTINO, no el actual. Sólo
        // super_admin llega a cambiarlo (el controller borra concesionariaId del
        // body para todos los demás), y puede moverlo de concesionaria y
        // reasignarle sucursal en el MISMO PATCH. Validar contra el tenant actual
        // deja el guard justo al revés: rechaza el movimiento coherente —sucursal
        // del tenant nuevo— y deja pasar el incoherente —sucursal del viejo—, que
        // es exactamente la FK cruzada que este chequeo existe para impedir.
        //
        // Se preserva el null: un usuario de plataforma puede no tener tenant, y
        // assertMismoTenant con expectedTenantId null sólo chequea existencia.
        const tenantDestino = updateData.concesionariaId ?? exists.concesionariaId ?? null;
        await assertMismoTenant(
            'sucursal',
            updateData.sucursalId,
            tenantDestino != null ? Number(tenantDestino) : null,
        );

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
