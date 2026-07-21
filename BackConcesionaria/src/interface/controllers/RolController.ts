import { Request, Response, NextFunction } from 'express';
import { PrismaRolRepository } from '../../infrastructure/database/repositories/PrismaRolRepository';
import { GetRoles } from '../../application/use-cases/roles/GetRoles';

const repository = new PrismaRolRepository();
const getRolesUC = new GetRoles(repository);

export class RolController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await getRolesUC.execute();
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
}
