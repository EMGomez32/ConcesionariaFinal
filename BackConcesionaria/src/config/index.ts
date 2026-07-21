import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

interface Config {
    env: string;
    port: number;
    prisma: {
        url: string | undefined;
    };
    jwt: {
        secret: string;
        refreshSecret: string;
        accessExpirationMinutes: string;
        refreshExpirationDays: string;
    };
    logLevel: string;
}

const config: Config = {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    prisma: {
        url: process.env.DATABASE_URL,
    },
    jwt: {
        secret: process.env.JWT_SECRET as string,
        refreshSecret: process.env.JWT_REFRESH_SECRET as string,
        accessExpirationMinutes: process.env.JWT_EXPIRES_IN || '15m',
        refreshExpirationDays: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    },
    logLevel: process.env.LOG_LEVEL || 'debug',
};

// Simple validation to ensure critical variables are set
const requiredVars = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
requiredVars.forEach((v) => {
    if (!process.env[v]) {
        console.error(`FATAL ERROR: Environment variable ${v} is not defined.`);
        process.exit(1);
    }
});

export default config;
