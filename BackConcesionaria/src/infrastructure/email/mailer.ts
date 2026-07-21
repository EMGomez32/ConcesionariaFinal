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

const FROM = env.SMTP_FROM || 'no-reply@concesionaria.local';

export async function sendPasswordResetEmail(to: string, link: string): Promise<void> {
    if (!transporter) {
        logger.warn(`[mailer] SMTP no configurado — link de recuperación para ${to}: ${link}`);
        return;
    }

    await transporter.sendMail({
        from: FROM,
        to,
        subject: 'Recuperación de contraseña',
        text:
            `Recibimos un pedido para restablecer tu contraseña.\n\n` +
            `Entrá a este link para elegir una nueva (vence en 1 hora):\n${link}\n\n` +
            `Si no lo solicitaste, ignorá este correo.`,
        html:
            `<p>Recibimos un pedido para restablecer tu contraseña.</p>` +
            `<p><a href="${link}">Restablecer contraseña</a> (el link vence en 1 hora).</p>` +
            `<p style="color:#6b7280;font-size:12px">Si no lo solicitaste, ignorá este correo.</p>`,
    });
    logger.info(`[mailer] email de recuperación enviado a ${to}`);
}
