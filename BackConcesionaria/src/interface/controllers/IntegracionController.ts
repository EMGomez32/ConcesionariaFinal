import { Request, Response, NextFunction } from 'express';
import type { ModoIntegracion } from '@prisma/client';
import prisma from '../../infrastructure/database/prisma';
import { audit } from '../../infrastructure/security/audit';
import { resolveConcesionariaId } from '../../infrastructure/security/resolveConcesionariaId';
import { BaseException, NotFoundException, ValidationException } from '../../domain/exceptions/BaseException';
import { cifrarConfig, estaCifrado } from '../../infrastructure/security/secretBox';
import { estadoCanalesMeta } from '../../domain/services/canalesMeta';
import {
    CAMPOS_SECRETOS,
    OPCIONALES_BORRABLES_META,
    metaConfigSchema,
    emailConfigSchema,
    updateMetaConfigSchema,
    updateEmailConfigSchema,
} from '../validation/integracion.schema';
import {
    NOMBRE_INTEGRACION_DEMO,
    activarDemoMeta,
    assertSinDemoMetaActiva,
    desactivarDemoMeta,
    esIntegracionDemo,
    sembrarConversacionesDemo,
} from '../../application/services/integracionDemo';

/**
 * CRUD de integraciones de canal (webhook Meta / casilla IMAP). Admin-only
 * (en el router). Sin capa repo: el modelo es chico y la extensión de Prisma
 * ya scopea tenant + soft-delete; el cuidado extra acá es que las credenciales
 * del `config` NUNCA salgan en claro (se enmascaran en toda respuesta).
 *
 * Toda respuesta agrega `canales`: qué puede hacer la integración con lo que
 * tiene cargado (Lead Ads, DM de Messenger/Instagram, comentarios). Es derivado,
 * no se guarda — así la pantalla dice la verdad sola cuando el admin completa
 * un id, en vez de depender de un checkbox que alguien se olvida de tildar.
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

/**
 * Config enmascarada + estado de los canales. `canales` se calcula sobre el
 * config CRUDO (antes de enmascarar): sólo mira qué campos están presentes,
 * nunca su valor. Para 'email' va vacío — no tiene canales que negociar.
 *
 * `demo` viaja DUPLICADO con el `modo` que ya trae la fila, a propósito: la
 * pantalla decide el rótulo SIMULACIÓN antes de mirar el detalle, y el flag vive
 * al lado de `activo` para que ese caso no dependa de leer bien el enum. Lo
 * simulado se muestra, no se esconde.
 *
 * El `modo` viaja a `estadoCanalesMeta` porque es él quien decide qué canal está
 * habilitado —también para una integración simulada, que los reporta listos
 * aunque no tenga tokens—: la regla vive en el dominio y no se duplica acá. Sin
 * pasarlo, la demostración aparecía en Ajustes con "Ningún canal listo".
 */
const enmascarar = <T extends { tipo: string; config: unknown; modo: ModoIntegracion }>(integracion: T) => ({
    ...integracion,
    config: enmascararConfig(integracion.config),
    canales: integracion.tipo === 'meta' ? estadoCanalesMeta(integracion.config, integracion.modo) : [],
    demo: esIntegracionDemo(integracion),
});

/**
 * La integración simulada no se edita ni se borra por el CRUD común.
 *
 * No es celo: su `config` no tiene credenciales (no las necesita) y el PATCH
 * revalida la config mergeada contra el schema COMPLETO de meta, así que
 * cualquier edición moriría con un 400 pidiendo un app secret que no existe. Y
 * el DELETE de acá es una baja LÓGICA: dejaría los hilos simulados en la bandeja
 * colgando de una integración invisible, imposible de responder y también de
 * borrar. Las dos cosas se hacen desde el modo demostración, que además limpia.
 */
function assertNoEsDemo(integracion: { modo?: string | null }, accion: 'editar' | 'eliminar'): void {
    if (!esIntegracionDemo(integracion)) return;
    throw new BaseException(
        409,
        accion === 'editar'
            ? 'Esta es la integración de demostración: no tiene datos que editar porque no se conecta con Meta. '
              + 'Si querés apagarla, usá "Salir del modo demostración".'
            : 'Esta es la integración de demostración. Para borrarla usá "Salir del modo demostración": '
              + 'así se van también las conversaciones de ejemplo, que si no quedarían en la bandeja sin poder responderse.',
        'META_INTEGRACION_DEMO',
    );
}

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
            // Lo real y lo simulado no conviven, y el candado va en las DOS
            // direcciones: `activarDemoMeta` ya rechaza encender la demostración
            // con una integración real activa; sin este corte, hacerlo al revés
            // (conectar la real con la demostración puesta) dejaba las dos vivas
            // y la bandeja mezclando hilos fabricados con mensajes de gente de
            // verdad. Mismo corte simétrico que ya tiene Mercado Libre.
            if (tipo === 'meta') await assertSinDemoMetaActiva(concesionariaId);
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
            assertNoEsDemo(existente, 'editar');

            const { nombre, activo, config } = req.body;
            // La otra puerta por la que se llegaba a tener las dos vivas: volver
            // a encender con el switch una integración real de Meta que se había
            // apagado justamente para poder activar la demostración. El corte es
            // sólo en la transición apagada → encendida: editarle el nombre o la
            // config a una real que ya estaba activa no cambia la convivencia.
            if (existente.tipo === 'meta' && activo === true && !existente.activo) {
                await assertSinDemoMetaActiva(existente.concesionariaId);
            }
            let configFinal: Record<string, unknown> | undefined;
            if (config !== undefined) {
                // La config llega PARCIAL y se valida contra el tipo GUARDADO (el
                // tipo no se cambia por PATCH), mergeando sobre la config existente.
                const schemaParcial = existente.tipo === 'meta' ? updateMetaConfigSchema : updateEmailConfigSchema;
                const parcial = schemaParcial.safeParse(config);
                if (!parcial.success) lanzarValidacion(parcial.error.issues);
                const guardada = (existente.config ?? {}) as Record<string, unknown>;
                // Sólo pisan lo guardado las claves que trajeron VALOR: una clave
                // ausente que el parseo materializa como `undefined` borraría el
                // dato viejo al spreadear (pasa con los campos preprocesados,
                // como los ids de Meta).
                const entrante = Object.fromEntries(
                    Object.entries(parcial.data as Record<string, unknown>).filter(([, v]) => v !== undefined),
                );
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
                // Los ids opcionales de Meta NO son secretos: el admin los ve y
                // los puede vaciar. Un '' explícito en el body = borrar el
                // guardado (el schema lo normalizó a undefined, así que hay que
                // mirar el body crudo para distinguir "vacié el campo" de "no
                // mandé el campo").
                if (existente.tipo === 'meta') {
                    const crudo = (config ?? {}) as Record<string, unknown>;
                    for (const campo of OPCIONALES_BORRABLES_META) {
                        const valor = crudo[campo];
                        if (typeof valor === 'string' && valor.trim() === '') delete mergeada[campo];
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
            assertNoEsDemo(existente, 'eliminar');
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

    // ── Modo demostración de los canales de Meta ─────────────────────────────
    // Los cuatro canales (DM de Instagram, Messenger, comentarios de Instagram y
    // de Facebook) dependen del App Review de Meta. Hasta que salga, la
    // demostración recorre el circuito completo con hilos fabricados y rotulados,
    // sin credenciales y sin una sola llamada a Meta.

    /**
     * POST /integraciones/demo — enciende el modo demostración del tenant.
     * Idempotente: si ya estaba activo devuelve 200 y lo deja como está.
     */
    static async activarDemo(req: Request, res: Response, next: NextFunction) {
        try {
            const concesionariaId = resolveConcesionariaId(req.body?.concesionariaId);
            // Sólo es null para un super_admin que no eligió tenant.
            if (concesionariaId == null) {
                throw new BaseException(
                    400,
                    'Elegí una concesionaria para activar el modo demostración de Instagram y Facebook',
                    'VALIDATION_ERROR',
                );
            }
            const { integracion, creada } = await activarDemoMeta(concesionariaId);
            await audit({
                entidad: 'IntegracionCanal',
                accion: creada ? 'create' : 'update',
                entidadId: integracion.id,
                detalle: `Modo demostración de Instagram y Facebook activado (${NOMBRE_INTEGRACION_DEMO}: no se conecta con Meta)`,
                concesionariaId,
            });
            // Misma forma que una integración del listado (rótulo incluido), para
            // que la pantalla pueda pintar el estado nuevo sin esperar el refetch.
            res.status(creada ? 201 : 200).json({ ...enmascarar(integracion), creada });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /integraciones/demo/conversaciones — siembra los hilos de ejemplo.
     *
     * La bandeja sólo se puede mostrar si hay algo adentro, y en modo
     * demostración no hay nadie escribiendo. Las filas se crean con la MISMA
     * forma que les daría la ingesta del webhook, así que responder, asignar,
     * cerrar y registrar la consulta recorren el código real.
     */
    static async sembrarConversacionesDemo(req: Request, res: Response, next: NextFunction) {
        try {
            const concesionariaId = resolveConcesionariaId(req.body?.concesionariaId);
            if (concesionariaId == null) {
                throw new BaseException(
                    400,
                    'Elegí una concesionaria para generar las conversaciones de ejemplo',
                    'VALIDATION_ERROR',
                );
            }
            const siembra = await sembrarConversacionesDemo(concesionariaId);
            await audit({
                entidad: 'Conversacion',
                accion: 'create',
                detalle: `Se generaron ${siembra.creadas} conversaciones simuladas de Instagram y Facebook`
                    + `${siembra.yaExistian > 0 ? ` (${siembra.yaExistian} ya estaban sembradas: se reiniciaron)` : ''}`
                    + `${siembra.respuestasDescartadas > 0 ? `; se descartaron ${siembra.respuestasDescartadas} respuestas simuladas de la corrida anterior` : ''}`,
                concesionariaId,
            });
            res.status(201).json(siembra);
        } catch (error) {
            next(error);
        }
    }

    /** DELETE /integraciones/demo — apaga la demostración y borra lo simulado. */
    static async desactivarDemo(req: Request, res: Response, next: NextFunction) {
        try {
            // Por query y no por body: el DELETE se dispara desde un botón, sin cuerpo.
            const concesionariaId = resolveConcesionariaId(req.query?.concesionariaId);
            if (concesionariaId == null) {
                throw new BaseException(
                    400,
                    'Elegí una concesionaria para salir del modo demostración',
                    'VALIDATION_ERROR',
                );
            }
            const baja = await desactivarDemoMeta(concesionariaId);
            await audit({
                entidad: 'IntegracionCanal',
                // 'delete' y no 'delete_soft': acá la fila se va de verdad.
                accion: 'delete',
                entidadId: baja.integracionId,
                detalle: `Modo demostración de Instagram y Facebook desactivado (se borraron `
                    + `${baja.conversacionesEliminadas} conversaciones y ${baja.mensajesEliminados} mensajes simulados; `
                    + `quedan ${baja.clientesConservados} clientes registrados desde conversaciones simuladas)`,
                concesionariaId,
            });
            res.json({
                conversacionesEliminadas: baja.conversacionesEliminadas,
                mensajesEliminados: baja.mensajesEliminados,
                clientesConservados: baja.clientesConservados,
            });
        } catch (error) {
            next(error);
        }
    }
}
