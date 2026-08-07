import { Request, Response, NextFunction } from 'express';
import { PrismaRolRepository } from '../../infrastructure/database/repositories/PrismaRolRepository';
import { GetRoles } from '../../application/use-cases/roles/GetRoles';
import { context } from '../../infrastructure/security/context';

const repository = new PrismaRolRepository();
const getRolesUC = new GetRoles(repository);

export class RolController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const result: any = await getRolesUC.execute();
            // super_admin es un rol global de plataforma: no se lo ofrecemos a un
            // actor no-super para que ni siquiera pueda enumerar su id (defensa en
            // profundidad junto a assertRolesAsignables). Un super_admin sí lo ve.
            const isSuper = context.getUser()?.roles?.includes('super_admin') ?? false;
            const roles = Array.isArray(result)
                ? (isSuper ? result : result.filter((r: any) => r?.nombre !== 'super_admin'))
                : result;
            res.json(roles);
        } catch (error) {
            next(error);
        }
    }
}
