import app from './app';
import config from './config';
import logger from './utils/logger';
import { iniciarWorkerIngestaEmail } from './infrastructure/integraciones/emailIngest';

const server = app.listen(config.port, () => {
    logger.info(`--------------------------------------------------`);
    logger.info(`🚀 Concesionaria SaaS API running on port ${config.port}`);
    logger.info(`🌍 Environment: ${config.env}`);
    logger.info(`--------------------------------------------------`);

    // Worker de ingesta de consultas por email (casillas IMAP de las
    // integraciones): NUNCA en tests (además, los tests importan app, no server).
    if (config.env !== 'test') {
        iniciarWorkerIngestaEmail();
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
