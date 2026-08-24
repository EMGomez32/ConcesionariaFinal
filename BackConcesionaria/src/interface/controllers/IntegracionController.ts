import { Request, Response, NextFunction } from 'express';
import prisma from '../../infrastructure/database/prisma';
import { audit } from '../../infrastructure/security/audit';
import { resolveConcesionariaId } from '../../infrastructure/security/resolveConcesionariaId';
import { BaseException, NotFoundException, ValidationException } from '../../domain/exceptions/BaseException';
import { cifrarConfig, estaCifrado } from '../../infrastructure/security/secretBox';
import {
    CAMPOS_SECRETOS,
    metaConfigSchema,
    emailConfigSchema,
    updateMetaConfigSchema,
    updateEmailConfigSchema,
} from '../validation/integracion.schema';

/**
 * CRUD de integraciones de canal (webhook Meta / casilla IMAP). Admin-only
 * (en el router). Sin capa repo: el modelo es chico y la extensión de Prisma
 * ya scopea tenant + soft-delete; el cuidado extra acá es que las credenciales
 * del `config` NUNCA salgan en claro (se enmascaran en toda respuesta).
 */

/** '••••' + últimos 4 de cada campo secreto presente; el resto queda igual. */
const enmascararConfig = (config: unknown): Record<string, unknown> => {
    const out: Record<string, unknown> = { ...((config ?? {}) as Record<string, unknown>) };
    for (const campo of CAMPOS_SECRETOS) {
        const valor = out[campo];
        if (typeof valor === 'string' && valor.length > 0) {
            // Cifrado en reposo: no hay "últimos 4" legibles que mostrar.
            out[campo] = estaCifrado(valor) ? '••••••••' : '••••' + valor.slice(-4);
        }
    }
    return out;
};

const enmascarar = <T extends { config: unknown }>(integracion: T) => ({
    ...integracion,
    config: enmascararConfig(integracion.config),
});

// Function declaration (no arrow) a propósito: el `never` explícito deja que
// el control-flow de TS narrowee el safeParse tras el `if (!success)`.
function lanzarValidacion(issues: { path: PropertyKey[]; message: string }[]): never {
    const details = issues.map((issue) => ({
        campo: ['config', ...issue.path].join('.'),
        mensaje: issue.message,
    }));
    const message = details.map((d) => `${d.campo}: ${d.mensaje}`).join('; ');
    throw new ValidationException(details, message);
}

export class IntegracionController {
    static async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const integraciones = await prisma.integracionCanal.findMany({ orderBy: { id: 'asc' } });
            res.json(integraciones.map(enmascarar));
        } catch (error) {
            next(error);
        }
    }

    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const concesionariaId = resolveConcesionariaId(req.body?.concesionariaId);
            // Sólo es null para un super_admin que no eligió tenant (el admin trae
            // el suyo del token): sin esto Prisma tira "concesionaria is missing" (500).
            if (concesionariaId == null) {
                throw new BaseException(400, 'Elegí una concesionaria para crear la integración', 'VALIDATION_ERROR');
            }
            const { tipo, nombre, activo, config } = req.body;
            const creada = await prisma.integracionCanal.create({
                data: { concesionariaId, tipo, nombre, activo: activo ?? true, config: cifrarConfig(config) },
            });
            await audit({
                entidad: 'IntegracionCanal',
                accion: 'create',
                entidadId: creada.id,
                detalle: `Integración ${nombre} (${tipo}) creada`,
                concesionariaId,
            });
            res.status(201).json(enmascarar(creada));
        } catch (error) {
            next(error);
        }
    }

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const existente = await prisma.integracionCanal.findFirst({ where: { id } });
            if (!existente) {
                throw new NotFoundException('Integración');
            }

            const { nombre, activo, config } = req.body;
            let configFinal: Record<string, unknown> | undefined;
            if (config !== undefined) {
                // La config llega PARCIAL y se valida contra el tipo GUARDADO (el
                // tipo no se cambia por PATCH), mergeando sobre la config existente.
                const schemaParcial = existente.tipo === 'meta' ? updateMetaConfigSchema : updateEmailConfigSchema;
                const parcial = schemaParcial.safeParse(config);
                if (!parcial.success) lanzarValidacion(parcial.error.issues);
                const guardada = (existente.config ?? {}) as Record<string, unknown>;
                const entrante = parcial.data as Record<string, unknown>;
                const mergeada: Record<string, unknown> = { ...guardada, ...entrante };
                // Secreto vacío u omitido (o el valor enmascarado reenviado tal
                // cual por el form) = conservar el guardado.
                for (const campo of CAMPOS_SECRETOS) {
                    const valor = entrante[campo];
                    if (valor === undefined || valor === '' || (typeof valor === 'string' && valor.startsWith('••••'))) {
                        if (guardada[campo] === undefined) delete mergeada[campo];
                        else mergeada[campo] = guardada[campo];
                    }
                }
                // La config resultante tiene que quedar COMPLETA para su tipo.
                const schemaCompleto = existente.tipo === 'meta' ? metaConfigSchema : emailConfigSchema;
                const completa = schemaCompleto.safeParse(mergeada);
                if (!completa.success) lanzarValidacion(completa.error.issues);
                // Cifrar al persistir. Esto también es la migración lazy: una
                // config legada en claro queda cifrada en su primer update.
                configFinal = cifrarConfig(completa.data as Record<string, unknown>);
            }

            const actualizada = await prisma.integracionCanal.update({
                where: { id },
                data: {
                    ...(nombre !== undefined ? { nombre } : {}),
                    ...(activo !== undefined ? { activo } : {}),
                    ...(configFinal !== undefined ? { config: configFinal } : {}),
                },
            });
            await audit({
                entidad: 'IntegracionCanal',
                accion: 'update',
                entidadId: id,
                detalle: `Integración ${actualizada.nombre} actualizada`,
                concesionariaId: existente.concesionariaId,
            });
            res.json(enmascarar(actualizada));
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id as string, 10);
            const existente = await prisma.integracionCanal.findFirst({ where: { id } });
            if (!existente) {
                throw new NotFoundException('Integración');
            }
            // delete físico interceptado por la extensión → soft delete (deletedAt).
            await prisma.integracionCanal.delete({ where: { id } });
            await audit({
                entidad: 'IntegracionCanal',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `Integración ${existente.nombre} eliminada`,
                concesionariaId: existente.concesionariaId,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
}
