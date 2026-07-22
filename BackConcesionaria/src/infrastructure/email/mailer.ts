import nodemailer from 'nodemailer';
import { env } from '../../config/env';
import { logger } from '../logging/logger';

// Transporter solo si hay SMTP configurado. Sin SMTP, el flujo de recuperación
// sigue funcionando: el link se escribe en los logs (útil en dev / hasta que
// carguen credenciales de un proveedor de email real).
const smtpConfigured = Boolean(env.SMTP_HOST && env.SMTP_PORT);

const transporter = smtpConfigured
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
    : null;

const FROM = env.SMTP_FROM || 'AUTENZA <no-reply@autenza.nebulant.com.ar>';

// Plantilla HTML de marca AUTENZA. Layout con tablas + estilos inline (lo único
// que renderiza confiable en clientes de email). El gradiente cae a emerald sólido
// en Outlook (motor Word, sin gradientes) gracias al `background` previo.
function renderPasswordResetHtml(link: string): string {
    const gradient = 'linear-gradient(135deg,#10b981 0%,#06b6d4 50%,#8b5cf6 100%)';
    const year = new Date().getFullYear();
    return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:#eef1f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 28px rgba(15,23,42,.10);">
<tr><td style="background:#10b981;background-image:${gradient};padding:28px 32px;text-align:center;">
<div style="font-size:22px;font-weight:700;letter-spacing:6px;color:#ffffff;">AUTENZA</div>
<div style="font-size:10px;letter-spacing:3px;color:rgba(255,255,255,.85);text-transform:uppercase;margin-top:4px;">Dealer Operating System</div>
</td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 12px;font-size:19px;color:#0f172a;">Restablecé tu contraseña</h1>
<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569;">Recibimos un pedido para restablecer la contraseña de tu cuenta. Hacé clic en el botón para elegir una nueva. El enlace vence en <strong>1 hora</strong>.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 22px;">
<tr><td align="center" style="border-radius:10px;background:#10b981;">
<a href="${link}" target="_blank" style="display:inline-block;padding:13px 30px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Restablecer contraseña</a>
</td></tr>
</table>
<p style="margin:0 0 6px;font-size:12px;color:#94a3b8;">Si el botón no funciona, copiá y pegá este enlace en tu navegador:</p>
<p style="margin:0 0 20px;font-size:12px;word-break:break-all;"><a href="${link}" style="color:#06b6d4;">${link}</a></p>
<p style="margin:0;font-size:12px;color:#94a3b8;">Si no solicitaste este cambio, ignorá este correo — tu contraseña actual sigue siendo válida.</p>
</td></tr>
<tr><td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #eef1f6;text-align:center;">
<div style="font-size:11px;color:#94a3b8;">&copy; ${year} AUTENZA &middot; Correo automático, no respondas a esta dirección.</div>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

export async function sendPasswordResetEmail(to: string, link: string): Promise<void> {
    if (!transporter) {
        logger.warn(`[mailer] SMTP no configurado — link de recuperación para ${to}: ${link}`);
        return;
    }

    await transporter.sendMail({
        from: FROM,
        to,
        subject: 'Restablecé tu contraseña · AUTENZA',
        text:
            `AUTENZA — Restablecé tu contraseña\n\n` +
            `Recibimos un pedido para restablecer la contraseña de tu cuenta.\n` +
            `Entrá a este enlace para elegir una nueva (vence en 1 hora):\n${link}\n\n` +
            `Si no lo solicitaste, ignorá este correo — tu contraseña actual sigue siendo válida.`,
        html: renderPasswordResetHtml(link),
    });
    logger.info(`[mailer] email de recuperación enviado a ${to}`);
}
