import app from './app';
import config from './config';
import logger from './utils/logger';
import { iniciarWorkerIngestaEmail } from './infrastructure/integraciones/emailIngest';
import { iniciarWorkerEnvioWhatsapp } from './infrastructure/whatsapp/envioWorker';
import { iniciarCuentasActivas } from './application/services/whatsappManager';
import { hayClaveDeSecretos } from './infrastructure/security/secretBox';

const server = app.listen(config.port, () => {
    logger.info(`--------------------------------------------------`);
    logger.info(`🚀 Concesionaria SaaS API running on port ${config.port}`);
    logger.info(`🌍 Environment: ${config.env}`);
    logger.info(`--------------------------------------------------`);

    // Worker de ingesta de consultas por email (casillas IMAP de las
    // integraciones): NUNCA en tests (además, los tests importan app, no server).
    if (config.env !== 'test') {
        if (!hayClaveDeSecretos()) {
            logger.warn('INTEGRACIONES_SECRET_KEY no está seteada: los secretos de integraciones se guardan EN CLARO (los protege sólo la RLS). Generar con openssl rand -hex 32.');
        }
        iniciarWorkerIngestaEmail();

        // Cola de salida de WhatsApp: despacha los mensajes pendientes con el
        // espaciado anti-ban (reemplaza a BullMQ; AUTENZA no tiene Redis).
        iniciarWorkerEnvioWhatsapp();

        // Reconecta los sockets de Baileys de las cuentas activas. Las
        // credenciales viven en WHATSAPP_AUTH_DIR (volumen persistente en
        // Docker), así que un reinicio NO vuelve a pedir QR. No se hace await:
        // vincular varias cuentas tarda y no debe demorar el listen (el
        // Promise.resolve tolera que el manager devuelva void en vez de promesa).
        void Promise.resolve(iniciarCuentasActivas()).catch((err) => {
            logger.error(`No se pudieron reconectar las cuentas de WhatsApp: ${err instanceof Error ? err.message : String(err)}`);
        });
    }
});

// Manejo de errores que no son atrapados por Express
process.on('unhandledRejection', (err: any) => {
    logger.error('UNHANDLED REJECTION! 💥 Shutting down...');
    logger.error(err);
    server.close(() => {
        process.exit(1);
    });
});

process.on('uncaughtException', (err: any) => {
    logger.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
    logger.error(err);
    process.exit(1);
});
