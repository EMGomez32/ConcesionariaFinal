import { z } from 'zod';

/**
 * Validación del módulo de ATENCIÓN PRESENCIAL (el flujo del vendedor).
 *
 * `z.object` descarta lo no declarado → corta el mass-assignment. Acá NO se
 * declaran, a propósito:
 *   - `vendedorId` del cierre / del registro de vehículos: quién atendió lo
 *     estampa el service desde el token. Si viniera del body, un vendedor podría
 *     escribirle atenciones a otro.
 *   - `estado`, `cerradaEn`, `cerradaAutomaticamente`, `presupuestoRealCalculado`:
 *     los calcula el flujo. `cerradaAutomaticamente` en particular es la marca que
 *     distingue el cierre del barrido del cierre real, y alimenta la alerta: si se
 *     pudiera mandar por body, la alerta se apaga sola.
 *   - `precioMinimo` de una unidad: dato sensible, no entra ni sale por acá.
 *   - `concesionariaId`: el resto de los módulos lo aceptan para que el super_admin
 *     elija tenant. Acá NO: la atención presencial la abre un usuario DEL salón
 *     (el `vendedorId` es una FK a un usuario de esa concesionaria), y la cuenta de
 *     plataforma no tiene salón donde atender. El service devuelve un
 *     `SIN_CONCESIONARIA` claro en vez de dejar pasar un parámetro que no hace nada.
 *
 * La REGLA de la apertura ("nunca bloquear el avance por falta de datos") se
 * refleja en que casi todo es opcional. Lo que el encargo SÍ exige —DNI, email,
 * domicilio y consentimiento— se exige recién al registrar interés real, y esa
 * exigencia vive en el service (es una regla de negocio con estado, no una forma
 * del body): ver `atencionService.exigirDatosParaInteresReal`.
 */

// ── Espejos de los enums de prisma/schema.prisma ────────────────────────────
const motivoEnum = z.enum(['consulta_general', 'unidad_puntual', 'vuelve_por_atencion_anterior'], {
    error: 'Motivo inválido. Válidos: consulta_general, unidad_puntual, vuelve_por_atencion_anterior',
});
const resultadoEnum = z.enum(
    ['reserva', 'cotizacion', 'test_drive', 'permuta_a_tasar', 'en_analisis', 'sin_unidad', 'se_retiro'],
    { error: 'Resultado inválido. Válidos: reserva, cotizacion, test_drive, permuta_a_tasar, en_analisis, sin_unidad, se_retiro' },
);
const modoBusquedaEnum = z.enum(['presupuesto', 'modelo', 'unidad'], {
    error: 'Modo de búsqueda inválido. Válidos: presupuesto, modelo, unidad',
});
const tipoFinanciamientoEnum = z.enum(['contado', 'credito', 'plan_de_ahorro'], {
    error: 'Tipo de financiamiento inválido. Válidos: contado, credito, plan_de_ahorro',
});
const tipoVehiculoEnum = z.enum(['buscada', 'sugerida'], {
    error: 'Tipo inválido. Válidos: buscada (la pidió el cliente), sugerida (la propuso el sistema)',
});
const accionEnum = z.enum(['vista', 'test_drive', 'cotizada', 'reservada'], {
    error: 'Acción inválida. Válidas: vista, test_drive, cotizada, reservada',
});
const nivelInteresEnum = z.enum(['bajo', 'medio', 'alto'], {
    error: 'Nivel de interés inválido. Válidos: bajo, medio, alto',
});
const medioContactoEnum = z.enum(['llamada', 'whatsapp', 'email', 'visita', 'otro'], {
    error: 'Medio de contacto inválido. Válidos: llamada, whatsapp, email, visita, otro',
});
const condicionTasacionEnum = z.enum(['excelente', 'muy_bueno', 'bueno', 'regular', 'malo'], {
    error: 'Condición inválida. Válidas: excelente, muy_bueno, bueno, regular, malo',
});
const estadoTasacionEnum = z.enum(['sin_tasar', 'tasada', 'rechazada'], {
    error: 'Estado de tasación inválido. Válidos: sin_tasar, tasada, rechazada',
});
const monedaEnum = z.enum(['ARS', 'USD'], { error: 'Moneda inválida (ARS o USD)' });

// ── Helpers (mismo criterio que tasacion.schema.ts) ─────────────────────────

/** El front manda '' por un campo vacío; eso NO es un dato, es la ausencia de uno. */
const textoOpcional = z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().trim().optional(),
);
const enteroOpcional = z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number().int().nonnegative().optional(),
);
/** FK opcional: 0 y '' son "no elegí ninguno", no el id 0. */
const fkOpcional = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);
const montoOpcional = z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number({ error: 'El importe debe ser un número' }).nonnegative('El importe no puede ser negativo').optional(),
);
/** Fecha en ISO (YYYY-MM-DD o timestamp completo). Se convierte a Date en el service. */
const fechaOpcional = z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().trim().refine((s) => !Number.isNaN(Date.parse(s)), 'Fecha inválida (usá YYYY-MM-DD)').optional(),
);

// ── Datos de contacto que se pueden traer en la apertura ────────────────────
const contacto = {
    telefono: textoOpcional,
    dni: textoOpcional,
    email: z.preprocess(
        (v) => (v === '' || v === null ? undefined : typeof v === 'string' ? v.trim().toLowerCase() : v),
        z.string().email('Email inválido').optional(),
    ),
};

/**
 * PASO 1a — identificar. NO persiste nada: sólo corre el dedupe y devuelve la
 * ficha con su historial y el aviso de asignación.
 *
 * Es POST y no GET a propósito: el teléfono y el DNI son datos personales y en un
 * GET viajarían en la query string, o sea al log de acceso y al historial del
 * navegador.
 */
export const identificarClienteSchema = z
    .object({
        nombre: textoOpcional,
        ...contacto,
    })
    .refine(
        (v) => Boolean(v.telefono || v.dni || v.email || v.nombre),
        { error: 'Para identificar al cliente hace falta al menos el nombre o un dato de contacto' },
    );

/**
 * PASO 1b — abrir la atención. Lo MÍNIMO es el nombre.
 *
 * `telefono` queda OPCIONAL aunque el encargo hable de "nombre y teléfono":
 * la regla explícita del flujo es "nunca bloquear el avance por falta de datos",
 * y alguien que no quiere dar el número igual tiene que poder ser atendido. Sin
 * teléfono el dedupe no puede evitar el duplicado, así que el service devuelve un
 * aviso en la respuesta (`avisos`) en vez de un 400.
 */
export const abrirAtencionSchema = z.object({
    nombre: z.string({ error: 'El nombre es obligatorio' }).trim().min(1, 'El nombre es obligatorio'),
    apellido: textoOpcional,
    ...contacto,
    motivo: motivoEnum.optional(),
    /** Sólo tiene sentido con motivo `vuelve_por_atencion_anterior`. */
    atencionAnteriorId: fkOpcional,
    observaciones: textoOpcional,
    /**
     * El cliente ya está asignado a OTRO vendedor y la asignación sigue vigente:
     * el sistema avisa (409) y sólo abre si el vendedor confirma. La atención
     * registra igual quién lo atendió REALMENTE — la reasignación es otra cosa y
     * la autoriza un admin.
     */
    confirmaAtenderAjeno: z.coerce.boolean().optional(),
});

/**
 * PASO 2 — enriquecimiento progresivo. El punto de integración con RENAPER/SID,
 * el día que se valide el DNI, es ACÁ (al completar los datos), no al abrir.
 */
export const completarClienteSchema = z.object({
    nombre: textoOpcional,
    apellido: textoOpcional,
    dni: textoOpcional,
    email: contacto.email,
    telefono: textoOpcional,
    direccion: textoOpcional,
    /**
     * Ley 25.326. Sólo se acepta `true`: el consentimiento se OTORGA, no se
     * revoca por un PATCH del vendedor (para eso hay que ir a la ficha del
     * cliente, que es un camino auditado aparte).
     */
    consentimientoContacto: z.coerce.boolean().optional(),
});

/**
 * PASO 3 y 4 — relevamiento + búsqueda. Un solo endpoint: los tres modos, el
 * recálculo del presupuesto real y las alternativas salen juntos, porque el
 * vendedor los usa en el mismo movimiento delante del cliente.
 */
export const buscarUnidadesSchema = z
    .object({
        modo: modoBusquedaEnum,
        // Modo `unidad`: patente, VIN o N° de stock (que en este sistema es el id
        // de la unidad — no existe una numeración de stock aparte).
        dominio: textoOpcional,
        vin: textoOpcional,
        vehiculoId: fkOpcional,
        // Modo `modelo`.
        marca: textoOpcional,
        modelo: textoOpcional,
        version: textoOpcional,
        anio: enteroOpcional,
        // Modo `presupuesto`.
        presupuestoMin: montoOpcional,
        presupuestoMax: montoOpcional,
        // Financiamiento de mostrador (se guarda en la atención y recalcula el
        // presupuesto real junto con la permuta).
        anticipo: montoOpcional,
        cuotaMaxima: montoOpcional,
        tipoFinanciamiento: tipoFinanciamientoEnum.optional(),
        moneda: monedaEnum.optional(),
        /** El vendedor pide explícitamente volver a ver lo ya mostrado. */
        incluirYaMostradas: z.coerce.boolean().optional(),
    })
    .refine((v) => v.modo !== 'unidad' || Boolean(v.dominio || v.vin || v.vehiculoId), {
        error: 'Para buscar una unidad puntual hace falta la patente, el VIN o el N° de stock',
        path: ['dominio'],
    })
    .refine((v) => v.modo !== 'modelo' || Boolean(v.marca || v.modelo), {
        error: 'Para buscar por modelo hace falta al menos la marca o el modelo',
        path: ['modelo'],
    });

/**
 * PASO 5 — registro de lo mostrado. `motivoSugerencia` es el texto que el sistema
 * le mostró al vendedor: se guarda tal cual porque depende del stock de ese
 * momento y tiene que poder releerse en la próxima visita.
 */
export const registrarVehiculoSchema = z.object({
    vehiculoId: z.coerce.number({ error: 'La unidad es obligatoria' }).int().positive('La unidad es obligatoria'),
    tipo: tipoVehiculoEnum,
    accion: accionEnum.optional(),
    nivelInteres: nivelInteresEnum.optional(),
    motivoSugerencia: textoOpcional,
});

/**
 * PERMUTA — se materializa como una `Tasacion` vinculada a la atención (no hay un
 * modelo `Permuta`: Tasacion ya tiene marca, modelo, año, km, condición, valor,
 * moneda, tasador, PDF y pantalla).
 *
 * `valorEstimado` puede quedar vacío: ese es justamente el caso `sin_tasar` de la
 * concesionaria que sólo deja tasar al tasador.
 */
export const registrarPermutaSchema = z.object({
    marca: z.string({ error: 'La marca del usado es obligatoria' }).trim().min(1, 'La marca del usado es obligatoria'),
    modelo: z.string({ error: 'El modelo del usado es obligatorio' }).trim().min(1, 'El modelo del usado es obligatorio'),
    anio: enteroOpcional,
    km: enteroOpcional,
    // Dominio OBLIGATORIO: la permuta se materializa como una Tasacion que después
    // revisa el tasador, y sin la patente no sabe qué auto revisar. Mismo criterio
    // que createTasacionSchema.
    dominio: z.string({ error: 'El dominio del usado es obligatorio' }).trim().min(1, 'El dominio del usado es obligatorio'),
    condicion: condicionTasacionEnum.optional(),
    valorEstimado: montoOpcional,
    moneda: monedaEnum.optional(),
    /** Sólo para rechazarla explícitamente; `sin_tasar`/`tasada` los deduce el service del valor. */
    estado: estadoTasacionEnum.optional(),
    observaciones: textoOpcional,
});

/**
 * PASO 6 — cierre.
 *
 * `resultado` va OPCIONAL en el schema a propósito: la exigencia es una regla de
 * negocio ("ninguna atención queda abierta sin resultado") y el encargo pide que
 * falle con 409 y un mensaje claro, no con un 400 de forma. La lista de
 * resultados válidos igual se valida acá.
 */
export const cerrarAtencionSchema = z.object({
    resultado: resultadoEnum.optional(),
    observaciones: textoOpcional,
    /** Obligatorios cuando el resultado NO es definitivo (lo exige el service). */
    proximoContacto: fechaOpcional,
    medioProximoContacto: medioContactoEnum.optional(),
    notaProximoContacto: textoOpcional,
});

/**
 * REASIGNACIÓN — la autoriza un supervisor (rol `admin`), NUNCA el vendedor. El
 * gating es `authorize('admin')` en la ruta; acá sólo viaja a quién y por qué.
 */
export const reasignarClienteSchema = z.object({
    vendedorId: z.coerce.number({ error: 'Elegí el vendedor' }).int().positive('Elegí el vendedor'),
    motivo: textoOpcional,
});

// EL BARRIDO DE FIN DE DÍA no tiene schema porque no tiene ruta: lo corre el
// worker `infrastructure/atencion/cierreDiarioWorker` con la hora de corte que
// define el env, no un POST. Ver el encabezado de atencion.routes.ts.
