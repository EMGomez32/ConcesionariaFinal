import app from './app';
import config from './config';
import logger from './utils/logger';

const server = app.listen(config.port, () => {
    logger.info(`--------------------------------------------------`);
    logger.info(`🚀 Concesionaria SaaS API running on port ${config.port}`);
    logger.info(`🌍 Environment: ${config.env}`);
    logger.info(`--------------------------------------------------`);
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
