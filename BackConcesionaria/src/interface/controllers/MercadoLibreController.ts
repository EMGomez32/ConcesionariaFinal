import { NextFunction, Request, Response } from 'express';
import type { MercadoLibreCuenta } from '@prisma/client';
import prisma from '../../infrastructure/database/prisma';
import { withTenantTransaction } from '../../infrastructure/database/unitOfWork';
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
 *
 * Aparte del camino real está el MODO DEMOSTRACIÓN (/demo): una cuenta simulada
 * que no sale a la red y existe para poder mostrar el circuito completo sin la
 * app de Mercado Libre. Es alta y baja de esa cuenta, nada más: la simulación en
 * sí vive en el cliente de la API, así que publicar, sincronizar y responder
 * recorren EXACTAMENTE el mismo código que con una cuenta real.
 */

/**
 * Site del país para la primera vinculación (MLA = Argentina). Se lee de
 * process.env igual que meliClient, para que el host de autorización y el que
 * usa el cliente de la API salgan siempre del mismo valor.
 */
const SITE_POR_DEFECTO = process.env.ML_SITE_ID || 'MLA';

/**
 * Ocupa el lugar de los tokens en una cuenta de demostración. NO es un token y
 * no tiene que parecerlo: una cuenta demo nunca sale a la red (sus llamadas las
 * responde el simulador), así que no hay ningún secreto real que proteger y por
 * eso el alta demo tampoco exige INTEGRACIONES_SECRET_KEY, a diferencia de la
 * vinculación por OAuth. Si alguna vez este valor llegara a `accessTokenVigente`
 * sería porque el desvío al simulador se rompió, y falla ruidosamente: mejor eso
 * que una llamada real hecha "por accidente" durante una demostración.
 */
const TOKEN_CENTINELA_DEMO = 'demo:sin-token';

/** Vendedor simulado. Se muestra tal cual en Configuración: el nombre ya dice qué es. */
const NICKNAME_DEMO = 'VENDEDOR_DEMO';

/** Vencimiento nominal lejano: nada tiene que intentar renovar una cuenta que no tiene tokens. */
const VENCIMIENTO_DEMO_MS = 10 * 365 * 24 * 60 * 60 * 1000;

/**
 * Preguntas de ejemplo del modo demostración: son las que de verdad hace un
 * comprador de autos usados en Argentina (permuta, financiación, kilometraje,
 * precio de contado, papeles). La demostración se le muestra a otra persona y
 * con textos genéricos no se entendería para qué sirve la bandeja.
 *
 * El nombre de contacto lleva DEMO adelante a propósito: en pantalla tiene que
 * distinguirse de un preguntador real sin que nadie lo aclare.
 */
const PREGUNTAS_DEMO: Array<{ texto: string; nombreContacto: string; haceMinutos: number }> = [
    {
        texto: 'Hola, buenas. ¿Aceptan permuta? Tengo una EcoSport 2016 nafta con 95.000 km, papeles al día.',
        nombreContacto: 'COMPRADOR_DEMO_1',
        haceMinutos: 25,
    },
    {
        texto: '¿Hacen financiación? ¿Cuánto piden de anticipo y en cuántas cuotas lo puedo sacar?',
        nombreContacto: 'COMPRADOR_DEMO_2',
        haceMinutos: 95,
    },
    {
        texto: '¿El kilometraje es real? ¿Tiene los service hechos en el oficial? Me gustaría llevarlo a revisar con mi mecánico antes de cerrar.',
        nombreContacto: 'COMPRADOR_DEMO_3',
        haceMinutos: 190,
    },
    {
        texto: 'Buenas tardes, pagando de contado ¿cuál sería el último precio? Si nos arreglamos hoy le paso la seña por transferencia.',
        nombreContacto: 'COMPRADOR_DEMO_4',
        haceMinutos: 320,
    },
    {
        texto: '¿Está al día con la patente y la VTV? ¿La transferencia la gestionan ustedes o corre por mi cuenta?',
        nombreContacto: 'COMPRADOR_DEMO_5',
        haceMinutos: 480,
    },
];

/**
 * Sufijo del detalle de auditoría cuando la operación la resolvió el simulador.
 *
 * La pantalla de Auditoría es una pantalla más del sistema: sin esto quedaba
 * escrito por el propio sistema "Publicación 3 cerrada en Mercado Libre" para
 * una operación que nunca salió del servidor. Se decide por el id porque el
 * simulador emite TODOS los suyos con prefijo DEMO- (items y preguntas), así que
 * no hace falta una consulta extra para saberlo.
 */
const ID_SIMULADO = /^DEMO-/i;

const rotuloSimulado = (id: string | null | undefined): string =>
    (ID_SIMULADO.test(id ?? '') ? ' (SIMULADO: no salió a Mercado Libre)' : '');

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
 *
 * El orden pone PRIMERO la activa y recién después la más nueva, para que sea la
 * MISMA fila que elige `cuentaActivaDelTenant` (con la que el sistema publica y
 * responde). Ordenando sólo por id, un tenant con dos filas —una desactivada más
 * nueva que la vigente— mostraba en pantalla una cuenta y operaba con la otra:
 * exactamente el caso en el que el rótulo de simulación se le pega al aviso
 * equivocado.
 */
const buscarCuenta = (concesionariaId: number) =>
    prisma.mercadoLibreCuenta.findFirst({
        where: { concesionariaId },
        orderBy: [{ activa: 'desc' }, { id: 'desc' }],
    });

/**
 * Cuenta demo del tenant (activa o no). Va con `modo` explícito y no por el
 * `mlUserId`: el modo es el que decide si las llamadas van al simulador o a la
 * red, así que es la única fuente de verdad para rotular la pantalla.
 */
const buscarCuentaDemo = (concesionariaId: number) =>
    prisma.mercadoLibreCuenta.findFirst({
        where: { concesionariaId, modo: 'demo' },
        orderBy: { id: 'desc' },
    });

/**
 * Campos de la cuenta que SÍ salen al front: whitelist explícita, los tokens
 * NUNCA viajan. `modo`/`demo` van acá porque la pantalla tiene que poder rotular
 * la simulación en Ajustes, en la ficha del vehículo y en la bandeja: lo
 * simulado se muestra, no se esconde.
 */
const cuentaVisible = (cuenta: MercadoLibreCuenta) => ({
    id: cuenta.id,
    mlUserId: cuenta.mlUserId,
    nickname: cuenta.nickname,
    siteId: cuenta.siteId,
    activa: cuenta.activa,
    modo: cuenta.modo,
    demo: cuenta.modo === 'demo',
    ultimoError: cuenta.ultimoError,
    expiraEn: cuenta.expiraEn,
});

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
     *
     * `demo`/`modo` son ortogonales a esos dos: una demo activa da `conectada:
     * true` con `configurada: false` (justamente el escenario sin app de ML), y
     * es lo que la pantalla usa para rotular "SIMULACIÓN" en vez de dar a
     * entender que hay una cuenta de Mercado Libre atrás.
     */
    static async getCuenta(req: Request, res: Response, next: NextFunction) {
        try {
            const concesionariaId = resolveConcesionariaId(req.query?.concesionariaId);
            // super_admin sin concesionaria elegida: no hay tenant del que hablar.
            const cuenta = concesionariaId == null ? null : await buscarCuenta(concesionariaId);
            const esDemo = !!cuenta && cuenta.modo === 'demo';
            res.json({
                // La clave de cifrado cuenta como parte de "está configurada":
                // sin ella los tokens del vendedor irían a la base en texto
                // plano, así que la vinculación se rechaza igual que sin
                // ML_CLIENT_ID. Mejor decirlo acá que dejar el botón vivo.
                configurada: hayCredencialesMeli() && hayClaveDeSecretos(),
                conectada: !!cuenta && cuenta.activa,
                // Duplicado a propósito con `cuenta.demo`: la pantalla decide el
                // rótulo "SIMULACIÓN" antes de entrar al detalle de la cuenta, y
                // este flag vive con los otros dos de estado (configurada /
                // conectada) para que ese caso no dependa de leer bien el objeto.
                demo: esDemo,
                modo: cuenta?.modo ?? null,
                // Campos elegidos a mano: los tokens NUNCA salen de la base.
                cuenta: cuenta ? cuentaVisible(cuenta) : null,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /mercadolibre/demo — enciende el modo demostración del tenant.
     *
     * Crea una cuenta que NO existe en Mercado Libre: sirve para recorrer el
     * circuito completo (publicar, elegir tipo de publicación, pausar, cerrar,
     * responder preguntas) sin credenciales de la app de ML y sin publicar ni un
     * aviso de verdad, con el mismo criterio que el modo mock de AFIP. Todo lo
     * que salga de acá va rotulado como simulado en la pantalla.
     *
     * No pasa por OAuth ni por `exigirClaveDeCifradoMeli`: no hay tokens que
     * proteger (ver TOKEN_CENTINELA_DEMO).
     */
    static async activarDemo(req: Request, res: Response, next: NextFunction) {
        try {
            const concesionariaId = resolveConcesionariaId(req.body?.concesionariaId);
            if (concesionariaId == null) {
                throw new BaseException(
                    400,
                    'Elegí una concesionaria para activar el modo demostración de Mercado Libre',
                    'VALIDATION_ERROR',
                );
            }
            // Ningún RASTRO de lo real convive con la demostración, y el chequeo
            // NO mira `activa`: cuando Mercado Libre rechaza el refresh, la fila
            // real queda con `activa: false` (meliClient) pero conserva sus tokens
            // y, sobre todo, sus avisos siguen VIVOS y facturando allá. Con la demo
            // encendida encima de eso, el panel entero se rotula como simulación y
            // esos avisos reales se le muestran al que mira como si no existieran,
            // que es justo al revés de lo que el modo demostración tiene que hacer.
            const real = await prisma.mercadoLibreCuenta.findFirst({
                where: { concesionariaId, modo: 'real' },
            });
            if (real) {
                throw new BaseException(
                    409,
                    'Esta concesionaria tiene una cuenta real de Mercado Libre vinculada (aunque el vínculo esté caído). Desvinculala primero: mientras exista, lo publicado de verdad y lo simulado se mezclarían en la misma pantalla.',
                    'ML_CUENTA_REAL_ACTIVA',
                );
            }
            // Y aunque la cuenta ya no esté: desvincular soft-deletea la fila pero
            // NO toca las publicaciones, así que los avisos reales pueden seguir
            // vivos (y cobrando) en Mercado Libre. Un itemId que no empieza con
            // DEMO- es un aviso que existe afuera y hay que cerrarlo antes.
            const avisoReal = await prisma.publicacionMl.findFirst({
                where: {
                    concesionariaId,
                    // 'cerrada' es lo único que garantiza que el aviso ya no existe
                    // en Mercado Libre; sin itemId nunca llegó a existir.
                    estado: { not: 'cerrada' },
                    itemId: { not: null },
                    NOT: { itemId: { startsWith: 'DEMO-' } },
                },
                select: { itemId: true },
            });
            if (avisoReal) {
                throw new BaseException(
                    409,
                    `Esta concesionaria todavía tiene avisos publicados de verdad en Mercado Libre (por ejemplo ${avisoReal.itemId}). Cerralos antes de activar el modo demostración: con la demo encendida el panel rotula todo como simulado y esos avisos quedarían vivos sin que nadie los atienda.`,
                    'ML_PUBLICACIONES_REALES_VIVAS',
                );
            }
            // Id del vendedor simulado: se distingue a simple vista de un user_id
            // de Mercado Libre (que es numérico) y es estable por concesionaria,
            // así que reactivar la demo reusa siempre la misma fila.
            const mlUserId = `DEMO-${concesionariaId}`;
            const yaEstaba = await buscarCuentaDemo(concesionariaId);
            const datos = {
                nickname: NICKNAME_DEMO,
                siteId: SITE_POR_DEFECTO,
                modo: 'demo' as const,
                activa: true,
                ultimoError: null,
                accessToken: TOKEN_CENTINELA_DEMO,
                refreshToken: TOKEN_CENTINELA_DEMO,
                expiraEn: new Date(Date.now() + VENCIMIENTO_DEMO_MS),
            };
            // Upsert (y no create): el alta es idempotente — volver a apretar el
            // botón deja la demo como estaba en vez de reventar con un P2002 del
            // unique [concesionariaId, mlUserId] delante de quien mira la demo.
            // `deletedAt: null` revive la fila si quedó una baja lógica vieja: el
            // unique no distingue borrados y el create fallaría igual.
            const cuenta = await prisma.mercadoLibreCuenta.upsert({
                where: { concesionariaId_mlUserId: { concesionariaId, mlUserId } },
                create: { concesionariaId, mlUserId, ...datos },
                update: { ...datos, deletedAt: null },
            });
            await audit({
                entidad: 'MercadoLibreCuenta',
                accion: yaEstaba ? 'update' : 'create',
                entidadId: cuenta.id,
                detalle: 'Modo demostración de Mercado Libre activado (cuenta simulada: no publica avisos reales)',
                concesionariaId,
            });
            // Se devuelve la cuenta con la MISMA forma que el `cuenta` de GET
            // /mercadolibre/cuenta (rótulo de demo incluido), para que la pantalla
            // pueda pintar el estado nuevo sin esperar el refetch. `creada`
            // distingue el alta de la reactivación, que es lo único que cambia.
            res.status(yaEstaba ? 200 : 201).json({ ...cuentaVisible(cuenta), creada: !yaEstaba });
        } catch (error) {
            next(error);
        }
    }

    /**
     * DELETE /mercadolibre/demo — apaga el modo demostración y borra lo simulado.
     *
     * Borrón y cuenta nueva, no baja lógica: la demostración se repite y arrancar
     * con las publicaciones y preguntas simuladas de la vez anterior arruina el
     * relato. Por eso el borrado es FÍSICO y en UNA transacción — a mitad de
     * camino quedarían preguntas colgando de una cuenta que ya no está.
     *
     * Lo que NO se borra: los clientes que se hayan generado desde una pregunta
     * simulada. No es un olvido — la ingesta puede haber matcheado y actualizado
     * un cliente REAL preexistente (el operador cargó un teléfono ya conocido), y
     * un borrado en cascada se llevaría puesto ese dato. Quedan rotulados con
     * `origenSimulado` y se CUENTAN en la respuesta: al borrarse las preguntas
     * desaparece el back-link, así que el conteo es lo único que le dice al
     * usuario que en Clientes quedó algo de la demostración.
     */
    static async desactivarDemo(req: Request, res: Response, next: NextFunction) {
        try {
            const concesionariaId = resolveConcesionariaId(req.query?.concesionariaId);
            if (concesionariaId == null) {
                throw new BaseException(
                    400,
                    'Elegí una concesionaria para salir del modo demostración de Mercado Libre',
                    'VALIDATION_ERROR',
                );
            }
            const cuenta = await buscarCuentaDemo(concesionariaId);
            if (!cuenta) {
                throw new BaseException(
                    409,
                    'El modo demostración de Mercado Libre no está activo en esta concesionaria.',
                    'ML_SIN_CUENTA_DEMO',
                );
            }
            const borrado = await withTenantTransaction(async (tx) => {
                // `tx` NO pasa por la extensión: el concesionariaId va a mano en
                // cada where (para un super_admin nadie lo inyecta) y el delete es
                // el físico de verdad, no el soft-delete que reescribe la
                // extensión. Las preguntas van primero: apuntan a la publicación.
                //
                // Se leen ANTES de borrar las que llegaron a ser lead: el
                // `clienteId` es el único puente hacia el CRM y muere con la fila.
                const conLead = await tx.preguntaMl.findMany({
                    where: { concesionariaId, cuentaId: cuenta.id, clienteId: { not: null } },
                    select: { clienteId: true },
                });
                const preguntas = await tx.preguntaMl.deleteMany({
                    where: { concesionariaId, cuentaId: cuenta.id },
                });
                const publicaciones = await tx.publicacionMl.deleteMany({
                    where: { concesionariaId, cuentaId: cuenta.id },
                });
                await tx.mercadoLibreCuenta.deleteMany({ where: { concesionariaId, id: cuenta.id } });
                return {
                    preguntas: preguntas.count,
                    publicaciones: publicaciones.count,
                    // Distintos: varias preguntas pueden haber caído en la misma ficha.
                    clientes: new Set(conLead.map((p) => p.clienteId)).size,
                };
            });
            await audit({
                entidad: 'MercadoLibreCuenta',
                // `delete` y no `delete_soft`: acá la fila se va de verdad.
                accion: 'delete',
                entidadId: cuenta.id,
                detalle: `Modo demostración de Mercado Libre desactivado (se borraron ${borrado.publicaciones} publicaciones y ${borrado.preguntas} preguntas simuladas; quedan ${borrado.clientes} clientes registrados desde preguntas simuladas)`,
                concesionariaId,
            });
            res.json({
                publicacionesEliminadas: borrado.publicaciones,
                preguntasEliminadas: borrado.preguntas,
                clientesConservados: borrado.clientes,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /mercadolibre/demo/preguntas — siembra preguntas de ejemplo.
     *
     * La bandeja sólo se puede mostrar si hay algo adentro, y en modo
     * demostración no hay compradores que pregunten. Las filas se crean con la
     * misma forma que las que ingiere el worker (mismo itemId de la publicación
     * simulada), así que responder/asignar/convertir en lead recorren el código
     * real: responder sale por el simulador igual que saldría por la API.
     */
    static async sembrarPreguntasDemo(req: Request, res: Response, next: NextFunction) {
        try {
            const concesionariaId = resolveConcesionariaId(req.body?.concesionariaId);
            if (concesionariaId == null) {
                throw new BaseException(
                    400,
                    'Elegí una concesionaria para generar las preguntas de ejemplo de Mercado Libre',
                    'VALIDATION_ERROR',
                );
            }
            const cuenta = await buscarCuentaDemo(concesionariaId);
            if (!cuenta || !cuenta.activa) {
                throw new BaseException(
                    409,
                    'El modo demostración de Mercado Libre no está activo. Activalo desde Configuración para poder generar preguntas de ejemplo.',
                    'ML_SIN_CUENTA_DEMO',
                );
            }
            // Sólo las que llegaron a tener itemId: una pregunta se enlaza a la
            // publicación por ese id (es lo que hace la ingesta real), y un
            // borrador que nunca se publicó no tiene ninguno.
            const candidatas = await prisma.publicacionMl.findMany({
                where: { concesionariaId, cuentaId: cuenta.id, itemId: { not: null } },
                orderBy: { id: 'desc' },
                take: PREGUNTAS_DEMO.length,
            });
            // El `not: null` del where NO estrecha el tipo de `itemId`: se confirma
            // acá con un guard en vez de afirmarlo con un cast. El itemId es lo que
            // enlaza la pregunta con su publicación, así que si alguien toca ese
            // where el compilador tiene que avisar, no descubrirse con una fila
            // sembrada contra un item vacío.
            const publicaciones = candidatas.filter(
                (p): p is typeof p & { itemId: string } => p.itemId !== null,
            );
            if (publicaciones.length === 0) {
                throw new BaseException(
                    409,
                    'Todavía no hay ninguna publicación simulada. Publicá primero un vehículo en modo demostración y después generá las preguntas de ejemplo.',
                    'ML_DEMO_SIN_PUBLICACIONES',
                );
            }
            // Entre 3 y 5 preguntas, repartidas sobre las publicaciones que haya:
            // con más autos publicados se siembran más, para que la bandeja se vea
            // con preguntas de distintas unidades y no cinco del mismo auto.
            const cuantas = Math.min(PREGUNTAS_DEMO.length, 2 + publicaciones.length);
            const sello = Date.now();
            const filas = PREGUNTAS_DEMO.slice(0, cuantas).map((plantilla, indice) => {
                const publicacion = publicaciones[indice % publicaciones.length];
                return {
                    concesionariaId,
                    cuentaId: cuenta.id,
                    publicacionId: publicacion.id,
                    // DEMO-Q-... se distingue a simple vista de un id de Mercado
                    // Libre. El id es DETERMINÍSTICO (publicación + plantilla) y no
                    // lleva sello de tiempo: con un sello, cada click generaba ids
                    // nuevos que nunca chocaban con el unique y sembraba el lote
                    // entero otra vez — la bandeja terminaba con COMPRADOR_DEMO_1
                    // preguntando dos veces lo mismo sobre el mismo auto.
                    mlQuestionId: `DEMO-Q-${publicacion.id}-${indice + 1}`,
                    itemId: publicacion.itemId,
                    mlFromUserId: `DEMO-U-${indice + 1}`,
                    nombreContacto: plantilla.nombreContacto,
                    texto: plantilla.texto,
                    estado: 'sin_responder' as const,
                    // Escalonadas hacia atrás: la bandeja ordena por fecha y todas
                    // con el mismo instante se ven como un volcado automático.
                    preguntadaEn: new Date(sello - plantilla.haceMinutos * 60_000),
                };
            });
            // createMany es la ÚNICA operación que la extensión no completa con el
            // tenant, por eso cada fila lleva su concesionariaId explícito.
            // `skipDuplicates` es lo que hace idempotente al botón: volver a
            // apretarlo sobre las mismas publicaciones no agrega nada, y publicar
            // otro vehículo sí siembra las preguntas de ESA unidad.
            const creadas = await prisma.preguntaMl.createMany({ data: filas, skipDuplicates: true });
            const yaExistian = filas.length - creadas.count;
            await audit({
                entidad: 'PreguntaMl',
                accion: 'create',
                detalle: `Se generaron ${creadas.count} preguntas simuladas de Mercado Libre (modo demostración${yaExistian > 0 ? `; ${yaExistian} ya estaban sembradas` : ''})`,
                concesionariaId,
            });
            res.status(201).json({ creadas: creadas.count, yaExistian });
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
            // El corte es simétrico al de activarDemo: con la demostración
            // encendida, vincular dejaba dos filas vivas y el tenant quedaba con
            // publicaciones simuladas y reales conviviendo en las mismas
            // pantallas. Primero se sale de la demostración (que borra lo
            // simulado) y después se vincula.
            const demo = await buscarCuentaDemo(concesionariaId);
            if (demo?.activa) {
                throw new BaseException(
                    409,
                    'La concesionaria está en modo demostración. Salí del modo demostración desde Configuración (se borra lo simulado) y después vinculá la cuenta real.',
                    'ML_DEMO_ACTIVA',
                );
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
                detalle: `Vehículo ${vehiculoId} publicado en Mercado Libre (${publicacion.itemId ?? 'sin itemId'}, tipo ${listingTypeId})${rotuloSimulado(publicacion.itemId)}`,
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

    /**
     * POST /mercadolibre/publicaciones/:id/pausar — la saca de la búsqueda sin
     * cerrarla. Va como pausa MANUAL: deja la marca que impide que la
     * sincronización la reactive sola (el vehículo sigue en 'publicado').
     */
    static async pausar(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseId(req.params.id, 'Id de publicación');
            const publicacion = await pausarPublicacion(id, true);
            await audit({
                entidad: 'PublicacionMl',
                accion: 'update',
                entidadId: id,
                detalle: `Publicación ${id} pausada en Mercado Libre${rotuloSimulado(publicacion.itemId)}`,
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
                detalle: `Publicación ${id} reactivada en Mercado Libre${rotuloSimulado(publicacion.itemId)}`,
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
                detalle: `Publicación ${id} cerrada en Mercado Libre${rotuloSimulado(publicacion.itemId)}`,
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
     *
     * La respuesta lleva `demo`: GET /mercadolibre/cuenta es admin-only, así que
     * sin este flag el vendedor sólo podía deducir la simulación de los ids de
     * las filas — y con la bandeja vacía (todo contestado, filtro "Eliminadas")
     * la pantalla se presentaba como una bandeja de Mercado Libre en producción,
     * sin una sola marca de simulación.
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
            const concesionariaId = resolveConcesionariaId(req.query?.concesionariaId);
            const cuenta = concesionariaId == null ? null : await cuentaActivaDelTenant(concesionariaId);
            res.json({ ...resultado, demo: cuenta?.modo === 'demo' });
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
                detalle: `Pregunta ${id} respondida en Mercado Libre${rotuloSimulado(pregunta.mlQuestionId)}`,
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
                detalle: `Pregunta ${id} registrada como consulta (cliente ${resultado.clienteId})${resultado.simulada ? ' (SIMULADA: la consulta la generó el modo demostración)' : ''}`,
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
