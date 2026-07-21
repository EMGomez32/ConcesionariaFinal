import { TokenPayload } from '../auth/auth.service';

declare global {
    namespace Express {
        interface Request {
            user?: TokenPayload;
            concesionariaId?: number;
        }
    }
}
