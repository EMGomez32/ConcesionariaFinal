import morgan from 'morgan';
import logger from '../utils/logger';
import config from '../config';

const morganFormat = config.env === 'development' ? 'dev' : 'combined';

export const requestLogger = morgan(morganFormat, {
    stream: {
        write: (message) => logger.info(message.trim()),
    },
});
