import { IUsuarioRepository } from '../../../domain/repositories/IUsuarioRepository';
import { BaseException, NotFoundException } from '../../../domain/exceptions/BaseException';
import { assertMismoTenant } from '../../../infrastructure/security/tenantGuard';
import { assertRolesAsignables, assertSuperAdminSinConcesionaria, nombresDeRoles } from '../../../infrastructure/security/usuarioPolicy';
import { assertObjetivoGestionable } from '../../../infrastructure/security/objetivoGestionable';
import { RevokeUserSessions } from '../auth/RevokeUserSessions';
import bcrypt from 'bcryptjs';

export class UpdateUsuario {
    constructor(
        private readonly usuarioRepository: IUsuarioRepository,
        private readonly revokeSessions: RevokeUserSessions,
    ) { }

    /**
     * `keepRefreshToken`: refresh de la sesión ACTUAL cuando el usuario se edita a
     * sí mismo (PATCH /usuarios/me); se conserva al cerrar las demás sesiones.
     */
    async execute(id: number, data: any, keepRefreshToken?: string | null) {
        const exists: any = await this.usuarioRepository.findById(id);
        if (!exists) {
            throw new NotFoundException('Usuario');
        }
        // La cuenta de un super_admin sólo la toca otro super_admin (email, roles, estado,
        // contraseña): ver assertObjetivoGestionable.
        assertObjetivoGestionable(exists);

        const { password, ...updateData } = data;

        // Seguridad: editar a OTRO usuario tampoco puede escalar a super_admin. El
        // controller ya strippea roleIds cuando te editás a vos mismo (anti
        // auto-lockout); esto cubre el vector de asignárselo a un tercero.
        await assertRolesAsignables(updateData.roleIds);

        // APP-02: el resultado del PATCH no puede ser un super_admin con concesionaria.
        // Sólo se evalúa si el PATCH toca roles o concesionaria, igual que el trigger de
        // la base: una cuenta vieja mal configurada se puede seguir editando en lo demás
        // (y se arregla quitándole la concesionaria o el rol en el mismo PATCH).
        const tocaRoles = Array.isArray(updateData.roleIds);
        const tocaTenant = updateData.concesionariaId !== undefined;
        if (tocaRoles || tocaTenant) {
            const rolesFinales = tocaRoles
                ? await nombresDeRoles(updateData.roleIds)
                : (exists.roles ?? []).map((r: any) => String(r?.rol?.nombre ?? r?.nombre ?? r));
            const tenantFinal = tocaTenant ? updateData.concesionariaId : (exists.concesionariaId ?? null);
            assertSuperAdminSinConcesionaria(rolesFinales, tenantFinal);
        }

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

        // Cambian las credenciales o el estado (contraseña, email, desactivación):
        // las sesiones abiertas ya no son de fiar y se cierran (ver RevokeUserSessions).
        const cambiaEmail = !!updateData.email && updateData.email !== exists.email;
        const seDesactiva = updateData.activo === false && exists.activo !== false;
        const revocar = !!password || cambiaEmail || seDesactiva;

        const result = await this.usuarioRepository.update(id, updateData);
        if (revocar) await this.revokeSessions.execute(id, keepRefreshToken);
        return result;
    }
}
