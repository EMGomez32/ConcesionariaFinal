import { NextFunction, Request, Response } from 'express';
import prisma from '../../infrastructure/database/prisma';
import { audit } from '../../infrastructure/security/audit';
import { context } from '../../infrastructure/security/context';
import { resolveConcesionariaId } from '../../infrastructure/security/resolveConcesionariaId';
import { emitirStateOauthMl } from '../../infrastructure/security/mlOauthState';
import { hayClaveDeSecretos } from '../../infrastructure/security/secretBox';
import { BaseException, ForbiddenException, NotFoundException } from '../../domain/exceptions/BaseException';
import { exigirClaveDeCifradoMeli, hayCredencialesMeli, urlDeAutorizacion } from '../../infrastructure/mercadolibre/meliClient';
import {
    cuentaActivaDelTenant,
    opcionesDePublicacion,
    publicarVehiculo,
    pausarPublicacion,
    reactivarPublicacion,
    cerrarPublicacion,
    reconciliarPublicacion,
} from '../../application/services/meliPublicacion';
import {
    listarPreguntas,
    responderPregunta,
    asignarPregunta,
    registrarPreguntaComoLead,
    ingestarPreguntasDeCuenta,
} from '../../application/services/meliPreguntas';

/**
 * Integración con Mercado Libre: vinculación OAuth de la cuenta del vendedor,
 * publicación de vehículos unidad por unidad y bandeja de preguntas.
 *
 * Sin capa repo: la extensión de Prisma ya scopea tenant + soft-delete y toda la
 * lógica que habla con la API vive en los services (meliPublicacion /
 * meliPreguntas). Acá queda sólo lo del borde HTTP: resolver el tenant, firmar
 * el `state` del OAuth, recortar por rol y auditar.
 *
 * Nada de este controller devuelve tokens: `accessToken`/`refreshToken` viven
 * cifrados en la fila y no salen nunca en una respuesta.
 */

/**
 * Site del país para la primera vinculación (MLA = Argentina). Se lee de
 * process.env igual que meliClient, para que el host de autorización y el que
 * usa el cliente de la API salgan siempre del mismo valor.
 */
const SITE_POR_DEFECTO = process.env.ML_SITE_ID || 'MLA';

/** Id de path, validado antes de tocar la base (un NaN suelto termina en un 500). */
const parseId = (raw: unknown, label: string): number => {
    const n = parseInt(String(raw), 10);
    if (!Number.isInteger(n) || n <= 0) {
        throw new BaseException(400, `${label} inválido`, 'INVALID_ID');
    }
    return n;
};

/** Query param numérico: descarta '', NaN y no-positivos en vez de propagarlos. */
const numeroOpcional = (raw: unknown): number | undefined => {
    if (raw === undefined || raw === null || raw === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * Vendedor "puro": tiene el rol vendedor y NINGUNO de los que ven todo el tenant.
 * Sólo ve/atiende las preguntas asignadas a él o sin asignar (mismo criterio que
 * la bandeja de WhatsApp y los reportes).
 */
const esVendedorPuro = (): boolean => {
    const roles = context.getUser()?.roles ?? [];
    return roles.includes('vendedor') && !roles.includes('admin') && !roles.includes('super_admin');
};

/**
 * Cuenta de Mercado Libre del tenant, esté activa o no: cuando el vínculo se
 * rompió (refresh rechazado) la fila queda con `activa: false` y el `ultimoError`
 * es justamente lo que el panel tiene que mostrar para pedir re-autorizar.
 *
 * El `where` lleva concesionariaId EXPLÍCITO porque para un super_admin la
 * extensión no inyecta tenant: sin esto vería la cuenta de otra concesionaria.
 */
const buscarCuenta = (concesionariaId: number) =>
    prisma.mercadoLibreCuenta.findFirst({ where: { concesionariaId }, orderBy: { id: 'desc' } });

/**
 * Cuenta ACTIVA del tenant del request, o 409. No es un 404: el recurso pedido
 * (el vehículo, la bandeja) existe; lo que falta es la vinculación, y el front
 * distingue ese caso para mandar al usuario a Configuración en vez de mostrar
 * "no encontrado".
 *
 * El tenant se resuelve EXPLÍCITO igual que en getCuenta/vincular: para un
 * super_admin la extensión no inyecta concesionariaId y la RLS tampoco filtra,
 * así que sin esto se devolvía la primera cuenta activa de TODA la plataforma —
 * publicar el auto de una concesionaria con el token (y a costa) de otra.
 */
const exigirCuentaActiva = async (elegida?: unknown) => {
    const concesionariaId = resolveConcesionariaId(elegida);
    if (concesionariaId == null) {
        throw new BaseException(
            400,
            'Elegí una concesionaria para operar con Mercado Libre',
            'VALIDATION_ERROR',
        );
    }
    const cuenta = await cuentaActivaDelTenant(concesionariaId);
    if (!cuenta) {
        throw new BaseException(
            409,
            'No hay una cuenta de Mercado Libre vinculada. Vinculala desde Configuración.',
            'ML_SIN_CUENTA',
        );
    }
    return cuenta;
};

/**
 * Pregunta visible para quien la pide. Se verifica ACÁ además de lo que haga el
 * service porque responder escribe EN NOMBRE del vendedor en una publicación
 * pública: un falso permitido no se puede deshacer (ML no borra respuestas).
 */
const exigirPreguntaVisible = async (preguntaId: number) => {
    const pregunta = await prisma.preguntaMl.findFirst({ where: { id: preguntaId } });
    if (!pregunta) throw new NotFoundException('Pregunta de Mercado Libre');
    if (esVendedorPuro()) {
        const usuarioId = context.getUser()?.userId ?? 0;
        // Sin asignar => cola común, la puede tomar cualquiera. Asignada a otro
        // => no es suya, ni para responder ni para convertir en lead.
        if (pregunta.asignadoAId != null && pregunta.asignadoAId !== usuarioId) {
            throw new ForbiddenException('La pregunta está asignada a otro vendedor');
        }
    }
    return pregunta;
};

export class MercadoLibreController {
    /**
     * GET /mercadolibre/cuenta — estado de la vinculación.
     * `configurada` es lo que le permite al panel decir "falta cargar
     * ML_CLIENT_ID/ML_CLIENT_SECRET en el servidor" en lugar de ofrecer un botón
     * de vincular que no puede funcionar.
     */
    static async getCuenta(req: Request, res: Response, next: NextFunction) {
        try {
            const concesionariaId = resolveConcesionariaId(req.query?.concesionariaId);
            // super_admin sin concesionaria elegida: no hay tenant del que hablar.
            const cuenta = concesionariaId == null ? null : await buscarCuenta(concesionariaId);
            res.json({
                // La clave de cifrado cuenta como parte de "está configurada":
                // sin ella los tokens del vendedor irían a la base en texto
                // plano, así que la vinculación se rechaza igual que sin
                // ML_CLIENT_ID. Mejor decirlo acá que dejar el botón vivo.
                configurada: hayCredencialesMeli() && hayClaveDeSecretos(),
                conectada: !!cuenta && cuenta.activa,
                // Campos elegidos a mano: los tokens NUNCA salen de la base.
                cuenta: cuenta
                    ? {
                        id: cuenta.id,
                        mlUserId: cuenta.mlUserId,
                        nickname: cuenta.nickname,
                        siteId: cuenta.siteId,
                        activa: cuenta.activa,
                        ultimoError: cuenta.ultimoError,
                        expiraEn: cuenta.expiraEn,
                    }
                    : null,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /mercadolibre/vincular — devuelve la URL de autorización de ML.
     * No vincula nada todavía: el vínculo se cierra en el callback público
     * (GET /api/webhooks/mercadolibre/callback) cuando ML devuelve el `code`.
     */
    static async vincular(req: Request, res: Response, next: NextFunction) {
        try {
            if (!hayCredencialesMeli()) {
                throw new BaseException(
                    409,
                    'Faltan ML_CLIENT_ID y ML_CLIENT_SECRET en el servidor: cargalos en el .env del backend y reiniciá el proceso para poder vincular Mercado Libre.',
                    'ML_SIN_CREDENCIALES',
                );
            }
            // Sin clave de cifrado no se arranca el flujo: al volver el callback
            // habría que guardar el par de tokens y quedarían en texto plano.
            exigirClaveDeCifradoMeli();
            const concesionariaId = resolveConcesionariaId(req.body?.concesionariaId);
            // Sólo es null para un super_admin que no eligió tenant: sin tenant no
            // hay a quién atribuirle la cuenta cuando vuelva el callback.
            if (concesionariaId == null) {
                throw new BaseException(400, 'Elegí una concesionaria para vincular la cuenta de Mercado Libre', 'VALIDATION_ERROR');
            }
            const usuarioId = context.getUser()?.userId ?? 0;
            const cuenta = await buscarCuenta(concesionariaId);
            // Re-vincular mantiene el país de la cuenta anterior; la primera vez
            // vale el del .env (el host de autorización de ML es por país).
            const siteId = cuenta?.siteId ?? SITE_POR_DEFECTO;
            // El `state` va firmado (dice a qué concesionaria corresponde el
            // callback) Y atado a ESTE navegador con una cookie: una firma
            // válida sola dejaba que el atacante le pasara su propio link a la
            // víctima y se quedara con la cuenta de Mercado Libre de ella.
            const state = emitirStateOauthMl(res, { cid: concesionariaId, sub: usuarioId });
            await audit({
                entidad: 'MercadoLibreCuenta',
                accion: 'update',
                detalle: 'Se generó el link de autorización de Mercado Libre',
                concesionariaId,
            });
            res.json({ url: urlDeAutorizacion(state, siteId) });
        } catch (error) {
            next(error);
        }
    }

    /** DELETE /mercadolibre/cuenta/:id — desvincula la cuenta del tenant. */
    static async desvincular(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseId(req.params.id, 'Id de cuenta');
            const cuenta = await prisma.mercadoLibreCuenta.findFirst({ where: { id } });
            if (!cuenta) throw new NotFoundException('Cuenta de Mercado Libre');
            // Se bajan TODAS las cuentas activas de la concesionaria, no sólo la
            // que se ve en pantalla: si quedara otra fila activa (una
            // vinculación vieja), el sistema seguiría publicando y contestando
            // con ESA, y el usuario habría creído que revocó el acceso.
            // Los tokens se borran ANTES del soft-delete: la fila sobrevive como
            // registro histórico (las publicaciones y preguntas la referencian),
            // pero sin credenciales que sigan sirviendo para publicar en nombre
            // del vendedor si alguien restaura la fila.
            await prisma.mercadoLibreCuenta.updateMany({
                where: { concesionariaId: cuenta.concesionariaId, activa: true },
                data: { activa: false, accessToken: '', refreshToken: '', ultimoError: null },
            });
            await prisma.mercadoLibreCuenta.delete({ where: { id } });
            await audit({
                entidad: 'MercadoLibreCuenta',
                accion: 'delete_soft',
                entidadId: id,
                detalle: `Cuenta de Mercado Libre "${cuenta.nickname ?? cuenta.mlUserId}" desvinculada`,
                concesionariaId: cuenta.concesionariaId,
            });
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /mercadolibre/vehiculos/:vehiculoId/opciones — qué haría falta para
     * publicar y cuánto sale cada tipo de publicación (costos EN VIVO de ML).
     */
    static async opciones(req: Request, res: Response, next: NextFunction) {
        try {
            const vehiculoId = parseId(req.params.vehiculoId, 'Id de vehículo');
            const cuenta = await exigirCuentaActiva(req.query?.concesionariaId);
            res.json(await opcionesDePublicacion(cuenta.id, vehiculoId));
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /mercadolibre/vehiculos/:vehiculoId/publicar — publica la unidad.
     * Publicar cuesta plata (el tipo elegido define cuánto), por eso es siempre
     * un acto explícito del usuario y nunca un efecto de crear el vehículo.
     */
    static async publicar(req: Request, res: Response, next: NextFunction) {
        try {
            const vehiculoId = parseId(req.params.vehiculoId, 'Id de vehículo');
            const cuenta = await exigirCuentaActiva(req.query?.concesionariaId);
            const { listingTypeId, titulo, categoriaId } = req.body;
            const publicacion = await publicarVehiculo({
                cuentaId: cuenta.id,
                vehiculoId,
                listingTypeId,
                titulo,
                categoriaId,
            });
            await audit({
                entidad: 'PublicacionMl',
                accion: 'create',
                entidadId: publicacion.id,
                detalle: `Vehículo ${vehiculoId} publicado en Mercado Libre (${publicacion.itemId ?? 'sin itemId'}, tipo ${listingTypeId})`,
                concesionariaId: publicacion.concesionariaId,
            });
            res.status(201).json(publicacion);
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /mercadolibre/vehiculos/:vehiculoId/publicacion — la publicación de la
     * unidad, o null si nunca se publicó (con null el panel muestra "Publicar").
     * Lectura para cualquier autenticado: es parte de la ficha del vehículo.
     */
    static async getPublicacion(req: Request, res: Response, next: NextFunction) {
        try {
            const vehiculoId = parseId(req.params.vehiculoId, 'Id de vehículo');
            const publicacion = await prisma.publicacionMl.findFirst({
                where: { vehiculoId },
                orderBy: { id: 'desc' },
            });
            res.json(publicacion);
        } catch (error) {
            next(error);
        }
    }

    /** POST /mercadolibre/publicaciones/:id/pausar — la saca de la búsqueda sin cerrarla. */
    static async pausar(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseId(req.params.id, 'Id de publicación');
            const publicacion = await pausarPublicacion(id);
            await audit({
                entidad: 'PublicacionMl',
                accion: 'update',
                entidadId: id,
                detalle: `Publicación ${id} pausada en Mercado Libre`,
                concesionariaId: publicacion.concesionariaId,
            });
            res.json(publicacion);
        } catch (error) {
            next(error);
        }
    }

    /** POST /mercadolibre/publicaciones/:id/reactivar — vuelve a mostrarla. */
    static async reactivar(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseId(req.params.id, 'Id de publicación');
            const publicacion = await reactivarPublicacion(id);
            await audit({
                entidad: 'PublicacionMl',
                accion: 'update',
                entidadId: id,
                detalle: `Publicación ${id} reactivada en Mercado Libre`,
                concesionariaId: publicacion.concesionariaId,
            });
            res.json(publicacion);
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /mercadolibre/publicaciones/:id/cerrar — cierre definitivo.
     * Se audita como `cancel` y no como `update`: en ML cerrar no tiene vuelta
     * atrás (para volver a vender hay que publicar de nuevo, y pagar de nuevo).
     */
    static async cerrar(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseId(req.params.id, 'Id de publicación');
            const publicacion = await cerrarPublicacion(id);
            await audit({
                entidad: 'PublicacionMl',
                accion: 'cancel',
                entidadId: id,
                detalle: `Publicación ${id} cerrada en Mercado Libre`,
                concesionariaId: publicacion.concesionariaId,
            });
            res.json(publicacion);
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /mercadolibre/publicaciones/:id/sincronizar — espeja lo que dice ML y
     * le empuja el precio y el estado actuales del vehículo. Es el botón manual
     * del mismo trabajo que hace solo el worker; sirve cuando el usuario quiere
     * verlo reflejado ya.
     */
    static async sincronizarPublicacion(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseId(req.params.id, 'Id de publicación');
            const publicacion = await reconciliarPublicacion(id);
            res.json(publicacion);
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /mercadolibre/preguntas — bandeja paginada.
     * Un vendedor puro NO elige a quién mirar: se le fuerza su propia bandeja
     * (asignadas a él + sin asignar) y se ignora el `asignadoAId` de la query,
     * que si no sería una forma trivial de espiar los leads de un compañero.
     */
    static async getPreguntas(req: Request, res: Response, next: NextFunction) {
        try {
            const { estado, asignadoAId, soloMias, page, limit } = req.query;
            const vendedorPuro = esVendedorPuro();
            const usuarioId = context.getUser()?.userId;
            const resultado = await listarPreguntas({
                estado: estado ? String(estado) : undefined,
                asignadoAId: vendedorPuro ? undefined : numeroOpcional(asignadoAId),
                soloMias: vendedorPuro ? true : soloMias === 'true',
                usuarioId,
                page: numeroOpcional(page),
                limit: numeroOpcional(limit),
            });
            res.json(resultado);
        } catch (error) {
            next(error);
        }
    }

    /** POST /mercadolibre/preguntas/:id/responder — publica la respuesta en ML. */
    static async responder(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseId(req.params.id, 'Id de pregunta');
            await exigirPreguntaVisible(id);
            const usuarioId = context.getUser()?.userId ?? 0;
            const pregunta = await responderPregunta(id, req.body.texto, usuarioId);
            await audit({
                entidad: 'PreguntaMl',
                accion: 'update',
                entidadId: id,
                detalle: `Pregunta ${id} respondida en Mercado Libre`,
                concesionariaId: pregunta.concesionariaId,
            });
            res.json(pregunta);
        } catch (error) {
            next(error);
        }
    }

    /** POST /mercadolibre/preguntas/:id/asignar — admin reparte la bandeja. */
    static async asignar(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseId(req.params.id, 'Id de pregunta');
            const { usuarioId } = req.body;
            const pregunta = await asignarPregunta(id, usuarioId);
            await audit({
                entidad: 'PreguntaMl',
                accion: 'update',
                entidadId: id,
                detalle: usuarioId == null
                    ? `Pregunta ${id} des-asignada (vuelve a la cola común)`
                    : `Pregunta ${id} asignada al usuario ${usuarioId}`,
                concesionariaId: pregunta.concesionariaId,
            });
            res.json(pregunta);
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /mercadolibre/preguntas/:id/lead — convierte la pregunta en consulta.
     * Reusa la ingesta común (dedupe por teléfono/email + round-robin), así que
     * un preguntador que ya es cliente NO genera un cliente duplicado.
     */
    static async crearLead(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseId(req.params.id, 'Id de pregunta');
            const pregunta = await exigirPreguntaVisible(id);
            const { nombre, telefono, email, vendedorId } = req.body;
            const resultado = await registrarPreguntaComoLead(id, { nombre, telefono, email, vendedorId });
            await audit({
                entidad: 'PreguntaMl',
                accion: 'update',
                entidadId: id,
                detalle: `Pregunta ${id} registrada como consulta (cliente ${resultado.clienteId})`,
                concesionariaId: pregunta.concesionariaId,
            });
            res.json(resultado);
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /mercadolibre/sincronizar — fuerza una pasada de ingesta de preguntas.
     * El worker ya la corre solo cada tanto; esto es el "actualizar ahora" del
     * panel para no esperar el próximo ciclo.
     */
    static async sincronizarAhora(req: Request, res: Response, next: NextFunction) {
        try {
            const cuenta = await exigirCuentaActiva(req.query?.concesionariaId);
            const resultado = await ingestarPreguntasDeCuenta(cuenta.id);
            res.json(resultado);
        } catch (error) {
            next(error);
        }
    }
}
