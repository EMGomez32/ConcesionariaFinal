import { Request, Response, NextFunction } from 'express';
import { PrismaClienteSeguimientoRepository } from '../../infrastructure/database/repositories/PrismaClienteSeguimientoRepository';
import { GetSeguimientosByCliente } from '../../application/use-cases/cliente-seguimientos/GetSeguimientosByCliente';
import { CreateClienteSeguimiento } from '../../application/use-cases/cliente-seguimientos/CreateClienteSeguimiento';
import { DeleteClienteSeguimiento } from '../../application/use-cases/cliente-seguimientos/DeleteClienteSeguimiento';
import { MarcarProximoContacto } from '../../application/use-cases/cliente-seguimientos/MarcarProximoContacto';
import { audit } from '../../infrastructure/security/audit';
import { resolveConcesionariaId } from '../../infrastructure/security/resolveConcesionariaId';

const repository = new PrismaClienteSeguimientoRepository();
const getByClienteUC = new GetSeguimientosByCliente(repository);
const createUC = new CreateClienteSeguimiento(repository);
const deleteUC = new DeleteClienteSeguimiento(repository);
const marcarUC = new MarcarProximoContacto(repository);

export class ClienteSeguimientoController {
    static async getByCliente(req: Request, res: Response, next: NextFunction) {
        try {
            const clienteId = parseInt(req.params.clienteId as string, 10);
            const result = await getByClienteUC.execute(clienteId);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const concesionariaId = resolveConcesionariaId(req.body?.concesionariaId);
            const result = await createUC.execute({ ...req.body, concesionariaId });
            await audit({
                entidad: 'ClienteSeguimiento',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `Seguimiento (${(result as any)?.tipo}) del cliente ${(result as any)?.clienteId}`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            await deleteUC.execute(id);
            await audit({
                entidad: 'ClienteSeguimiento',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `Seguimiento ${id} eliminado`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }

    static async marcarProximo(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            // Sin body ⇒ marcar hecho; { hecho:false } ⇒ reabrir.
            const hecho = req.body?.hecho ?? true;
            const result = await marcarUC.execute(id, hecho);
            await audit({
                entidad: 'ClienteSeguimiento',
                accion: 'update',
                entidadId: id,
                detalle: `Próximo contacto del seguimiento ${id} marcado ${hecho ? 'realizado' : 'pendiente'}`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
}
