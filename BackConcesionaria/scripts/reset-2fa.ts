/**
 * Escape de emergencia: apaga el 2FA de UNA cuenta (por email) cuando no hay otro admin que pueda
 * hacerlo desde la app. El caso típico es el ÚNICO super_admin que perdió el teléfono y los códigos
 * de recuperación. Corre con acceso a la base (en el servidor):
 *
 *   docker compose exec -T backend npx ts-node scripts/reset-2fa.ts persona@dominio.com
 *
 * Apaga el 2FA, borra los códigos de recuperación y cierra TODAS las sesiones de esa cuenta. Si el
 * rol exige 2FA (MFA_REQUIRED_ROLES), en el próximo login la cuenta tendrá que configurarlo de nuevo.
 * Deja constancia en security_events (accion `2fa_reset_script`).
 */
import { rawPrisma } from '../src/infrastructure/database/prisma';
import { desactivarMfa } from '../src/application/services/mfaService';
import { recordSecurityEvent } from '../src/infrastructure/security/securityEvents';

async function main() {
    const email = String(process.argv[2] ?? '').trim().toLowerCase();
    if (!email) {
        console.error('Uso: npx ts-node scripts/reset-2fa.ts <email>');
        process.exit(2);
    }

    const u = await rawPrisma.usuario.findFirst({ where: { email, deletedAt: null }, select: { id: true, email: true, totpEnabled: true } });
    if (!u) {
        console.error(`No existe un usuario activo con el email ${email}`);
        process.exit(1);
    }

    await desactivarMfa(u.id);
    const sesiones = await rawPrisma.refreshToken.deleteMany({ where: { usuarioId: u.id } });
    await recordSecurityEvent({
        accion: '2fa_reset_script',
        entidad: 'Usuario',
        entidadId: u.id,
        usuarioId: u.id,
        email: u.email,
        detalle: `2FA reseteado desde el servidor con scripts/reset-2fa.ts (tenía 2FA activo: ${u.totpEnabled}); ${sesiones.count} sesión(es) cerrada(s)`,
    });
    console.log(`[reset-2fa] OK: ${u.email} (id ${u.id}). 2FA apagado y ${sesiones.count} sesión(es) cerrada(s).`);
}

main()
    .catch((e) => { console.error('[reset-2fa] falló:', e instanceof Error ? e.message : e); process.exit(2); })
    .finally(async () => { await rawPrisma.$disconnect(); });
