import { z } from 'zod';

/**
 * MENSAJES DE VALIDACIÓN EN ESPAÑOL.
 *
 * Antes la respuesta de un 400 mezclaba nombres internos y mensajes en inglés
 * ("sucursalId: La sucursal es obligatorio; moneda: Invalid option: expected one of
 * \"ARS\"|\"USD\""): el usuario veía camelCase, géneros mal concordados y Zod crudo.
 *
 * Tres piezas:
 *  - `obligatorio` / `invalido`: concuerdan género y número con el artículo de la
 *    etiqueta ("La sucursal es obligatoria", "Los ítems son obligatorios"). Los usan
 *    los helpers de cada schema (idField, montoField…).
 *  - `mapaDeErrores`: el error map que validateBody le pasa a Zod. Arma el mensaje de
 *    las reglas que NO traen uno propio, con la etiqueta legible del campo
 *    (`ETIQUETAS`; si no está, el nombre en palabras: «fecha gasto»). Un mensaje
 *    propio del schema siempre gana.
 *  - El locale español de Zod como base global (`z.config`), para lo que se valida
 *    fuera de validateBody.
 */

// Base: lo que no pase por el mapa (p.ej. un safeParse suelto) sale en español igual.
z.config(z.locales.es());

interface Concordancia { femenino: boolean; plural: boolean }

function concordanciaDe(etiqueta: string): Concordancia {
    const articulo = etiqueta.trim().split(/\s+/)[0].toLowerCase();
    return { femenino: articulo === 'la' || articulo === 'las', plural: articulo === 'los' || articulo === 'las' };
}

const terminacion = ({ femenino, plural }: Concordancia) => (femenino ? 'a' : 'o') + (plural ? 's' : '');
const ser = (c: Concordancia) => (c.plural ? 'son' : 'es');
const tener = (c: Concordancia) => (c.plural ? 'tienen' : 'tiene');

/** "La sucursal es obligatoria", "El cliente es obligatorio", "Los ítems son obligatorios". */
export function obligatorio(etiqueta: string): string {
    const c = concordanciaDe(etiqueta);
    return `${etiqueta} ${ser(c)} obligatori${terminacion(c)}`;
}

/** "La sucursal no es válida", "El vehículo no es válido". */
export function invalido(etiqueta: string): string {
    const c = concordanciaDe(etiqueta);
    return `${etiqueta} no ${ser(c)} válid${terminacion(c)}`;
}

// Cómo se lee cada opción de un enum en un mensaje (el resto: `_` → espacio).
const OPCIONES_LEGIBLES: Record<string, string> = {
    credito: 'crédito',
    cotizacion: 'cotización',
    en_analisis: 'en análisis',
    se_retiro: 'se retiró',
    canje_mas_diferencia: 'canje más diferencia',
    deruedas: 'DeRuedas',
    mercadolibre: 'Mercado Libre',
    whatsapp: 'WhatsApp',
    instagram: 'Instagram',
    facebook: 'Facebook',
};

const opcionLegible = (v: unknown) =>
    typeof v === 'string' ? OPCIONES_LEGIBLES[v] ?? v.replace(/_/g, ' ') : String(v);

/** "ARS o USD", "activa, cancelada o vencida", "referido u otro". */
export function listaDeOpciones(valores: readonly unknown[]): string {
    const legibles = valores.map(opcionLegible);
    if (legibles.length <= 1) return legibles.join('');
    const ultima = legibles[legibles.length - 1];
    // "o" pasa a "u" antes de una palabra que empieza con o / ho.
    const conjuncion = /^h?o/i.test(ultima) ? 'u' : 'o';
    return `${legibles.slice(0, -1).join(', ')} ${conjuncion} ${ultima}`;
}

/** "Elegí una moneda válida: ARS o USD". `etiqueta` con artículo: "La moneda". */
export function elegiUnaOpcion(etiqueta: string, valores: readonly unknown[]): string {
    const c = concordanciaDe(etiqueta);
    const sustantivo = etiqueta.trim().split(/\s+/).slice(1).join(' ');
    const indefinido = (c.femenino ? 'una' : 'un') + (c.plural ? 's' : '');
    return `Elegí ${indefinido} ${sustantivo} válid${terminacion(c)}: ${listaDeOpciones(valores)}`;
}

/**
 * Etiqueta legible de cada campo que llega en un body, con su artículo (de él sale
 * la concordancia). La clave es el último tramo del path: `items.0.vehiculoId` →
 * `vehiculoId`.
 */
const ETIQUETAS: Record<string, string> = {
    // Relaciones
    sucursalId: 'La sucursal',
    sucursalDestinoId: 'La sucursal de destino',
    hastaSucursalId: 'La sucursal de destino',
    clienteId: 'El cliente',
    clienteOrigenId: 'El cliente de origen',
    vehiculoId: 'El vehículo',
    vehiculoCanjeId: 'El vehículo de canje',
    vendedorId: 'El vendedor',
    vendedorAsignadoId: 'El vendedor asignado',
    asignadoAId: 'El usuario asignado',
    usuarioId: 'El usuario',
    cobradorId: 'El cobrador',
    ventaId: 'La venta',
    presupuestoId: 'El presupuesto',
    reservaId: 'La reserva',
    atencionId: 'La atención',
    proveedorId: 'El proveedor',
    proveedorCompraId: 'El proveedor de la compra',
    proveedorOrigenId: 'El proveedor de origen',
    proveedorDestinoId: 'El proveedor de destino',
    financieraId: 'La financiera',
    categoriaId: 'La categoría',
    tipoId: 'El tipo',
    casoId: 'El caso',
    concesionariaId: 'La concesionaria',
    roleIds: 'Los roles',
    // Personas y contacto
    nombre: 'El nombre',
    apellido: 'El apellido',
    dni: 'El DNI',
    cuit: 'El CUIT',
    razonSocial: 'La razón social',
    email: 'El email',
    telefono: 'El teléfono',
    direccion: 'La dirección',
    ciudad: 'La ciudad',
    contacto: 'El contacto',
    password: 'La contraseña',
    currentPassword: 'La contraseña actual',
    newPassword: 'La contraseña nueva',
    // Unidades
    marca: 'La marca',
    modelo: 'El modelo',
    version: 'La versión',
    anio: 'El año',
    dominio: 'El dominio',
    vin: 'El VIN',
    color: 'El color',
    km: 'El kilometraje',
    kmIngreso: 'El kilometraje de ingreso',
    segmento: 'El segmento',
    vencimientoVtv: 'El vencimiento de la VTV',
    vencimientoSeguro: 'El vencimiento del seguro',
    // Importes y planes
    monto: 'El monto',
    moneda: 'La moneda',
    valor: 'El valor',
    valorTomado: 'El valor tomado',
    valorEstimado: 'El valor estimado',
    precioVenta: 'El precio de venta',
    precioLista: 'El precio de lista',
    precioCompra: 'El precio de compra',
    precioFinal: 'El precio final',
    precioMinimo: 'El precio mínimo',
    precioAutorizado: 'El precio autorizado',
    descuento: 'El descuento',
    montoFinanciado: 'El monto financiado',
    montoObjetivo: 'El monto objetivo',
    unidadesObjetivo: 'Las unidades objetivo',
    tasaMensual: 'La tasa mensual',
    cuotas: 'La cantidad de cuotas',
    plazoCuotas: 'La cantidad de cuotas',
    diaVencimiento: 'El día de vencimiento',
    mes: 'El mes',
    // Fechas
    fecha: 'La fecha',
    fechaVenta: 'La fecha de venta',
    fechaInicio: 'La fecha de inicio',
    fechaIngreso: 'La fecha de ingreso',
    fechaVencimiento: 'La fecha de vencimiento',
    fechaGasto: 'La fecha del gasto',
    fechaCompra: 'La fecha de compra',
    fechaPago: 'La fecha de pago',
    fechaReclamo: 'La fecha del reclamo',
    fechaMovimiento: 'La fecha del movimiento',
    fechaCreacion: 'La fecha de creación',
    validoHasta: 'La fecha de validez',
    proximoContacto: 'La fecha del próximo contacto',
    // Catálogos (enums)
    estado: 'El estado',
    estadoEntrega: 'El estado de entrega',
    estadoLead: 'El estado',
    estadoInicial: 'El estado inicial',
    status: 'El estado',
    tipo: 'El tipo',
    tipoIngreso: 'El tipo de ingreso',
    tipoFinanciamiento: 'El tipo de financiamiento',
    tipoDoc: 'El tipo de documento',
    condicionIva: 'La condición frente al IVA',
    origen: 'El origen',
    origenLead: 'El origen',
    condicion: 'La condición',
    metodo: 'El método de pago',
    formaPago: 'La forma de pago',
    formaPagoCompra: 'La forma de pago de la compra',
    resultado: 'El resultado',
    accion: 'La acción',
    modo: 'El modo de búsqueda',
    motivo: 'El motivo',
    nivelInteres: 'El nivel de interés',
    medioProximoContacto: 'El medio de contacto',
    // Textos y otros
    descripcion: 'La descripción',
    observaciones: 'Las observaciones',
    nota: 'La nota',
    texto: 'El texto',
    titulo: 'El título',
    respuesta: 'La respuesta',
    referencia: 'La referencia',
    nroPresupuesto: 'El número de presupuesto',
    url: 'La URL',
    code: 'El código',
    recoveryCode: 'El código de recuperación',
    token: 'El token',
    mfaToken: 'El token de verificación',
    refreshToken: 'El token de sesión',
    items: 'Los ítems',
    externos: 'Los extras',
    pagos: 'Los pagos',
    canjes: 'El canje',
    filas: 'Las filas',
    config: 'La configuración',
};

/** "fechaGasto" → "fecha gasto" (para un campo sin etiqueta propia). */
const enPalabras = (campo: string) =>
    campo.replace(/Id$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();

/** Etiqueta del campo de un path de Zod; sin campo (el body entero) → "Los datos enviados". */
export function etiquetaDe(path: readonly PropertyKey[] | undefined): string {
    const campo = [...(path ?? [])].reverse().find((p): p is string => typeof p === 'string');
    if (!campo) return 'Los datos enviados';
    return ETIQUETAS[campo] ?? `El campo «${enPalabras(campo)}»`;
}

const TIPOS: Record<string, string> = {
    number: 'un número',
    int: 'un número entero',
    string: 'un texto',
    boolean: 'sí o no',
    array: 'una lista',
};

/** Mensaje en español de un issue de Zod sin mensaje propio. */
function mensajeDe(iss: any): string {
    const etiqueta = etiquetaDe(iss.path);
    const c = concordanciaDe(etiqueta);

    switch (iss.code) {
        case 'invalid_type': {
            if (iss.input === undefined || iss.input === null) return obligatorio(etiqueta);
            const tipo = TIPOS[iss.expected];
            return tipo ? `${etiqueta} ${tener(c)} que ser ${tipo}` : invalido(etiqueta);
        }
        case 'invalid_value':
            return iss.values?.length > 1
                ? elegiUnaOpcion(etiqueta, iss.values)
                : invalido(etiqueta);
        case 'too_small': {
            const min = Number(iss.minimum);
            if (iss.origin === 'string') {
                return min <= 1 ? obligatorio(etiqueta) : `${etiqueta} ${tener(c)} que tener al menos ${min} caracteres`;
            }
            if (iss.origin === 'array' || iss.origin === 'set') {
                return `${etiqueta} ${tener(c)} que tener al menos ${min === 1 ? 'un elemento' : `${min} elementos`}`;
            }
            if (iss.origin === 'number' || iss.origin === 'bigint') {
                if (min === 0 && iss.inclusive) return `${etiqueta} no puede ser negativ${terminacion(c)}`;
                return `${etiqueta} ${tener(c)} que ser mayor ${iss.inclusive ? 'o igual ' : ''}a ${min}`;
            }
            return invalido(etiqueta);
        }
        case 'too_big': {
            const max = Number(iss.maximum);
            if (iss.origin === 'string') return `${etiqueta} no puede superar los ${max} caracteres`;
            if (iss.origin === 'array' || iss.origin === 'set') return `${etiqueta} no puede tener más de ${max} elementos`;
            if (iss.origin === 'number' || iss.origin === 'bigint') {
                return `${etiqueta} ${tener(c)} que ser menor ${iss.inclusive ? 'o igual ' : ''}a ${max}`;
            }
            return invalido(etiqueta);
        }
        case 'not_multiple_of':
            return `${etiqueta} ${tener(c)} que ser múltiplo de ${iss.divisor}`;
        case 'unrecognized_keys':
            return 'Hay datos que no se esperaban en la solicitud';
        default:
            // invalid_format (email, url, fecha…), invalid_union, custom sin mensaje, etc.
            return invalido(etiqueta);
    }
}

/** Error map para `schema.safeParse(body, { error: mapaDeErrores })`. */
export const mapaDeErrores: z.core.$ZodErrorMap = (iss) => mensajeDe(iss);
