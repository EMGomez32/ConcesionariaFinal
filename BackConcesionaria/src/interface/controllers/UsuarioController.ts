import { Request, Response, NextFunction } from 'express';
import { PrismaUsuarioRepository } from '../../infrastructure/database/repositories/PrismaUsuarioRepository';
import { GetUsuarios } from '../../application/use-cases/usuarios/GetUsuarios';
import { GetUsuarioById } from '../../application/use-cases/usuarios/GetUsuarioById';
import { CreateUsuario } from '../../application/use-cases/usuarios/CreateUsuario';
import { UpdateUsuario } from '../../application/use-cases/usuarios/UpdateUsuario';
import { DeleteUsuario } from '../../application/use-cases/usuarios/DeleteUsuario';
import { ResetPassword } from '../../application/use-cases/usuarios/ResetPassword';
import { ChangeMyPassword } from '../../application/use-cases/usuarios/ChangeMyPassword';
import { cleanFilters } from '../../utils/cleanFilters';
import { audit } from '../../infrastructure/security/audit';
import { context } from '../../infrastructure/security/context';
import { BaseException } from '../../domain/exceptions/BaseException';

const repository = new PrismaUsuarioRepository();
const getUsuariosUC = new GetUsuarios(repository);
const getUsuarioByIdUC = new GetUsuarioById(repository);
const createUsuarioUC = new CreateUsuario(repository);
const updateUsuarioUC = new UpdateUsuario(repository);
const deleteUsuarioUC = new DeleteUsuario(repository);
const resetPasswordUC = new ResetPassword(repository);
const changeMyPasswordUC = new ChangeMyPassword(repository);

export class UsuarioController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { limit, page, sortBy, sortOrder, ...filters } = req.query;
            const result = await getUsuariosUC.execute(cleanFilters(filters), { limit, page, sortBy, sortOrder } as any);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const result = await getUsuarioByIdUC.execute(id);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const actor = context.getUser();
            const isSuper = actor?.roles?.includes('super_admin');
            // El tenant sale del token, NO del body: un admin siempre crea en SU
            // concesionaria (aunque el body traiga otra, se ignora → sin fuga
            // cross-tenant). super_admin sí elige el tenant destino por body.
            // Antes el use case exigía concesionariaId y el form no lo mandaba:
            // crear usuarios devolvía 400 'concesionariaId es obligatorio'.
            const concesionariaId = isSuper
                ? (req.body?.concesionariaId ?? null)
                : (actor?.concesionariaId ?? null);
            const result = await createUsuarioUC.execute({ ...req.body, concesionariaId });
            await audit({
                entidad: 'Usuario',
                accion: 'create',
                entidadId: (result as any)?.id,
                detalle: `Usuario ${(result as any)?.nombre ?? (result as any)?.email ?? (result as any)?.id} creado`,
            });
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const data = { ...req.body };
            // Anti auto-lockout: editándote a vos mismo desde el ABM no podés
            // cambiar tus roles ni tu estado (te quedarías sin admin o inactivo,
            // sin nadie que lo revierta). Nombre/email sí, o usá Configuración.
            if (context.getUser()?.userId === id) {
                delete data.roleIds;
                delete data.roles;
                delete data.activo;
            }
            const result = await updateUsuarioUC.execute(id, data);
            await audit({
                entidad: 'Usuario',
                accion: 'update',
                entidadId: id,
                detalle: `Usuario ${(result as any)?.nombre ?? (result as any)?.email ?? id} actualizado`,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            // No podés eliminar tu propia cuenta: evita el footgun de borrarte y
            // que el tenant quede sin su único admin.
            if (context.getUser()?.userId === id) {
                throw new BaseException(400, 'No podés eliminar tu propia cuenta', 'SELF_DELETE');
            }
            await deleteUsuarioUC.execute(id);
            await audit({
                entidad: 'Usuario',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `Usuario ${id} eliminado`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }

    static async resetPassword(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const { password } = req.body ?? {};
            await resetPasswordUC.execute(id, password);
            await audit({
                entidad: 'Usuario',
                accion: 'update',
                entidadId: id,
                detalle: `Reset de contraseña para usuario ${id}`,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }

    // ── Autogestión: el usuario logueado opera sobre SU PROPIA cuenta ──────────
    // El id sale del token (context), nunca del body/param: así un usuario no
    // puede editar a otro ni escalar rol. Disponibles para cualquier rol.

    static async updateMe(req: Request, res: Response, next: NextFunction) {
        try {
            const uid = context.getUser()?.userId;
            if (!uid) throw new BaseException(401, 'Sesión no válida', 'UNAUTHORIZED');
            // Sólo nombre y email: roles, activo, sucursal y concesionaria no se
            // tocan desde el perfil propio (eso es administración).
            const { nombre, email } = req.body ?? {};
            const result = await updateUsuarioUC.execute(uid, { nombre, email });
            await audit({
                entidad: 'Usuario',
                accion: 'update',
                entidadId: uid,
                detalle: 'Actualización de perfil propio',
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async changeMyPassword(req: Request, res: Response, next: NextFunction) {
        try {
            const uid = context.getUser()?.userId;
            if (!uid) throw new BaseException(401, 'Sesión no válida', 'UNAUTHORIZED');
            const { currentPassword, newPassword } = req.body ?? {};
            await changeMyPasswordUC.execute(uid, currentPassword, newPassword);
            await audit({
                entidad: 'Usuario',
                accion: 'update',
                entidadId: uid,
                detalle: 'Cambio de contraseña propia',
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
}
