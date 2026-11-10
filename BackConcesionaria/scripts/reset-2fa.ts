/**
 * Escape de emergencia: apaga el 2FA de UNA cuenta (por email) cuando no hay otro admin que pueda
 * hacerlo desde la app. El caso típico es el ÚNICO super_admin que perdió el teléfono y los códigos
 * de recuperación. Corre con acceso a la base (en el servidor):
 *
 *   docker compose exec -T backend node dist-ops/scripts/reset-2fa.js persona@dominio.com </dev/null
 *
 * (La imagen de producción no trae ts-node: corre este script compilado en dist-ops/. En local,
 * sin compilar: `npx ts-node scripts/reset-2fa.ts <email>`.)
 *
 * Apaga el 2FA, borra los códigos de recuperación y cierra TODAS las sesiones de esa cuenta. Si el
 * rol exige 2FA (MFA_REQUIRED_ROLES), en el próximo login la cuenta tendrá que configurarlo de nuevo.
 * Deja constancia en security_events (accion `2fa_reset_script`).
 */
import { rawPrisma } from '../src/infrastructure/database/prisma';
import { withAuthBypass } from '../src/infrastructure/database/unitOfWork';
import { desactivarMfa } from '../src/application/services/mfaService';
import { recordSecurityEvent } from '../src/infrastructure/security/securityEvents';

async function main() {
    const email = String(process.argv[2] ?? '').trim().toLowerCase();
    if (!email) {
        console.error('Uso: node dist-ops/scripts/reset-2fa.js <email>   (en local: npx ts-node scripts/reset-2fa.ts <email>)');
        process.exit(2);
    }

    // withAuthBypass: en producción la conexión es la de app_rw y la RLS oculta `usuarios` y
    // `refresh_tokens` sin un tenant en contexto. Sin esto el escape respondía "no existe" con
    // cualquier email (el script corre sin sesión) y no servía justo cuando hace falta.
    const u = await withAuthBypass((tx) => tx.usuario.findFirst({ where: { email, deletedAt: null }, select: { id: true, email: true, totpEnabled: true } }));
    if (!u) {
        console.error(`No existe un usuario activo con el email ${email}`);
        process.exit(1);
    }

    await desactivarMfa(u.id);
    const sesiones = await withAuthBypass((tx) => tx.refreshToken.deleteMany({ where: { usuarioId: u.id } }));
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
