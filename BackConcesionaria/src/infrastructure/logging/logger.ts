import winston from 'winston';
import { env } from '../../config/env';

const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};

const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white',
};

winston.addColors(colors);

const isProd = env.NODE_ENV === 'production';

// Nivel: respeta LOG_LEVEL si es válido; si no, info en prod / debug en dev.
// (En prod ya NO se pierde 'info'/'http' — antes estaba fijo en 'warn' y no
// quedaba registro de accesos.)
const resolveLevel = (): string => {
    const fromEnv = (env.LOG_LEVEL || '').toLowerCase();
    if (fromEnv in levels) return fromEnv;
    return isProd ? 'info' : 'debug';
};

// Formato JSON estructurado (prod): una línea por evento, parseable, sin ANSI.
// Incluye timestamp ISO y stack de errores.
const jsonFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
);

// Formato legible y coloreado, solo para la consola en desarrollo.
const prettyFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.colorize({ all: true }),
    winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`),
);

// En producción: JSON a stdout (lo captura el logging driver de Docker, que ya
// tiene rotación configurada en docker-compose). En desarrollo: consola pretty
// + archivos JSON planos (sin ANSI) para poder greppear.
const transports: winston.transport[] = isProd
    ? [new winston.transports.Console({ format: jsonFormat })]
    : [
        new winston.transports.Console({ format: prettyFormat }),
        new winston.transports.File({ filename: 'logs/error.log', level: 'error', format: jsonFormat }),
        new winston.transports.File({ filename: 'logs/all.log', format: jsonFormat }),
    ];

export const logger = winston.createLogger({
    level: resolveLevel(),
    levels,
    transports,
});
