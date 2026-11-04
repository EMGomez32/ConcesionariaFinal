import type { AuditLog } from '../../api/auditoria.api';
import type { BadgeVariant } from '../../components/ui/Badge';

/**
 * Textos de la auditoría para personas. La base guarda la acción y la entidad
 * en crudo ("login_fail", "Usuario"); acá se convierten en frases ("Intento de
 * ingreso fallido", "Creó un vehículo"). Lo usan la página Auditoría y la
 * "Actividad reciente" del Inicio.
 */

/** Acciones que registra el backend (espejo del enum AccionAudit de Prisma). */
export const ACCIONES_AUDITORIA = [
    'create', 'update', 'cancel', 'delete_soft', 'delete', 'refinanciar',
    'login', 'logout', 'login_fail', 'password_reset_request', 'password_reset_done',
    'export', 'suprimir', 'bloquear', 'desbloquear', 'revocar_consentimiento', 'acceso_soporte',
] as const;

export const ACCION_AUDITORIA: Record<string, { label: string; variant: BadgeVariant }> = {
    create: { label: 'Alta', variant: 'success' },
    update: { label: 'Edición', variant: 'cyan' },
    cancel: { label: 'Anulación', variant: 'warning' },
    delete_soft: { label: 'Baja', variant: 'danger' },
    delete: { label: 'Borrado', variant: 'danger' },
    refinanciar: { label: 'Refinanciación', variant: 'violet' },
    login: { label: 'Ingreso', variant: 'default' },
    logout: { label: 'Salida', variant: 'default' },
    login_fail: { label: 'Ingreso fallido', variant: 'danger' },
    password_reset_request: { label: 'Pedido de contraseña', variant: 'warning' },
    password_reset_done: { label: 'Contraseña restablecida', variant: 'default' },
    export: { label: 'Exportación', variant: 'warning' },
    suprimir: { label: 'Supresión de datos', variant: 'danger' },
    bloquear: { label: 'Bloqueo de datos', variant: 'warning' },
    desbloquear: { label: 'Bloqueo levantado', variant: 'default' },
    revocar_consentimiento: { label: 'Consentimiento revocado', variant: 'warning' },
    acceso_soporte: { label: 'Acceso de soporte', variant: 'violet' },
};

const capitalizar = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

export const accionAuditoriaLabel = (accion: string): string =>
    ACCION_AUDITORIA[accion]?.label ?? capitalizar(accion.replace(/_/g, ' '));

export const accionAuditoriaVariant = (accion: string): BadgeVariant =>
    ACCION_AUDITORIA[accion]?.variant ?? 'default';

/** Entidad con su artículo: "un vehículo", "una venta". */
export const ENTIDAD_AUDITORIA: Record<string, { nombre: string; conArticulo: string }> = {
    AccesoSoporte: { nombre: 'Acceso del soporte de AUTENZA', conArticulo: 'datos de la concesionaria' },
    Atencion: { nombre: 'Atención', conArticulo: 'una atención' },
    AtencionVehiculo: { nombre: 'Unidad de una atención', conArticulo: 'una unidad de una atención' },
    CategoriaGastoFijo: { nombre: 'Rubro de gasto fijo', conArticulo: 'un rubro de gastos fijos' },
    CategoriaGastoVehiculo: { nombre: 'Rubro de gasto de unidad', conArticulo: 'un rubro de gastos de unidades' },
    Cliente: { nombre: 'Cliente', conArticulo: 'un cliente' },
    ClienteSeguimiento: { nombre: 'Seguimiento', conArticulo: 'un seguimiento' },
    ComprobanteAfip: { nombre: 'Comprobante AFIP', conArticulo: 'un comprobante AFIP' },
    Concesionaria: { nombre: 'Concesionaria', conArticulo: 'la concesionaria' },
    Conversacion: { nombre: 'Conversación', conArticulo: 'una conversación' },
    Cotizacion: { nombre: 'Cotización del dólar', conArticulo: 'una cotización del dólar' },
    Exportacion: { nombre: 'Exportación', conArticulo: 'un listado' },
    Financiacion: { nombre: 'Plan de financiación', conArticulo: 'un plan de financiación' },
    Financiera: { nombre: 'Financiera', conArticulo: 'una financiera' },
    GastoFijo: { nombre: 'Gasto fijo', conArticulo: 'un gasto fijo' },
    GastoVehiculo: { nombre: 'Gasto de unidad', conArticulo: 'un gasto de unidad' },
    IngresoVehiculo: { nombre: 'Ingreso', conArticulo: 'un ingreso' },
    IntegracionCanal: { nombre: 'Integración', conArticulo: 'una integración' },
    Invoice: { nombre: 'Factura del servicio', conArticulo: 'una factura del servicio' },
    MercadoLibreCuenta: { nombre: 'Cuenta de Mercado Libre', conArticulo: 'la cuenta de Mercado Libre' },
    MetaVenta: { nombre: 'Objetivo del mes', conArticulo: 'el objetivo del mes' },
    ObjetivoVendedor: { nombre: 'Objetivo de vendedor', conArticulo: 'un objetivo de vendedor' },
    Payment: { nombre: 'Pago del servicio', conArticulo: 'un pago del servicio' },
    Plan: { nombre: 'Plan del servicio', conArticulo: 'un plan del servicio' },
    PostventaCaso: { nombre: 'Caso de postventa', conArticulo: 'un caso de postventa' },
    PostventaItem: { nombre: 'Ítem de postventa', conArticulo: 'un ítem de postventa' },
    PreguntaMl: { nombre: 'Pregunta de Mercado Libre', conArticulo: 'una pregunta de Mercado Libre' },
    Presupuesto: { nombre: 'Presupuesto', conArticulo: 'un presupuesto' },
    Proveedor: { nombre: 'Proveedor', conArticulo: 'un proveedor' },
    PublicacionMl: { nombre: 'Publicación de Mercado Libre', conArticulo: 'una publicación de Mercado Libre' },
    Reserva: { nombre: 'Reserva', conArticulo: 'una reserva' },
    SolicitudFinanciacion: { nombre: 'Solicitud de financiación', conArticulo: 'una solicitud de financiación' },
    SolicitudFinanciacionArchivo: { nombre: 'Archivo de solicitud de financiación', conArticulo: 'un archivo de una solicitud de financiación' },
    SolicitudPrecioMinimo: { nombre: 'Pedido de precio mínimo', conArticulo: 'un pedido de precio mínimo' },
    SolicitudTitular: { nombre: 'Pedido de un titular de datos', conArticulo: 'un pedido de un titular de datos' },
    Sucursal: { nombre: 'Sucursal', conArticulo: 'una sucursal' },
    Suscripcion: { nombre: 'Suscripción', conArticulo: 'la suscripción' },
    Tasacion: { nombre: 'Tasación', conArticulo: 'una tasación' },
    TipoPostventa: { nombre: 'Tipo de postventa', conArticulo: 'un tipo de postventa' },
    Usuario: { nombre: 'Usuario', conArticulo: 'un usuario' },
    Vehiculo: { nombre: 'Vehículo', conArticulo: 'un vehículo' },
    VehiculoArchivo: { nombre: 'Archivo de vehículo', conArticulo: 'un archivo de un vehículo' },
    VehiculoInteres: { nombre: 'Interés en un vehículo', conArticulo: 'un interés en un vehículo' },
    VehiculoMovimiento: { nombre: 'Movimiento', conArticulo: 'un movimiento' },
    Venta: { nombre: 'Venta', conArticulo: 'una venta' },
    VentaCanje: { nombre: 'Canje de una venta', conArticulo: 'un canje de una venta' },
    VentaExtra: { nombre: 'Extra de una venta', conArticulo: 'un extra de una venta' },
    VentaPago: { nombre: 'Pago de una venta', conArticulo: 'un pago de una venta' },
    WhatsappCuenta: { nombre: 'Cuenta de WhatsApp', conArticulo: 'la cuenta de WhatsApp' },
};

/** "VehiculoArchivo" → "Vehiculo archivo" para una entidad que todavía no está en el mapa. */
const separarPalabras = (t: string) => capitalizar(t.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase());

export const entidadAuditoriaLabel = (entidad: string): string =>
    ENTIDAD_AUDITORIA[entidad]?.nombre ?? separarPalabras(entidad);

const conArticulo = (entidad: string): string =>
    ENTIDAD_AUDITORIA[entidad]?.conArticulo ?? `un registro de ${separarPalabras(entidad).toLowerCase()}`;

/** Lo que pasó, como frase: "Creó un vehículo", "Inició sesión", "Intento de ingreso fallido". */
export const fraseAuditoria = (log: Pick<AuditLog, 'accion' | 'entidad'>): string => {
    const cosa = conArticulo(log.entidad);
    switch (log.accion as string) {
        case 'create': return `Creó ${cosa}`;
        case 'update': return `Editó ${cosa}`;
        case 'cancel': return `Anuló ${cosa}`;
        case 'delete_soft': return `Dio de baja ${cosa}`;
        case 'delete': return `Borró ${cosa}`;
        case 'refinanciar': return `Refinanció ${cosa}`;
        case 'login': return 'Inició sesión';
        case 'logout': return 'Cerró sesión';
        case 'login_fail': return 'Intento de ingreso fallido';
        case 'password_reset_request': return 'Pidió restablecer la contraseña';
        case 'password_reset_done': return 'Restableció la contraseña';
        // Privacidad (Ley 25.326)
        case 'export': return log.entidad === 'Cliente' ? 'Descargó los datos de un cliente (derecho de acceso)' : 'Exportó un listado';
        case 'suprimir': return 'Suprimió los datos de un cliente';
        case 'bloquear': return 'Bloqueó los datos de un cliente';
        case 'desbloquear': return 'Levantó el bloqueo de un cliente';
        case 'revocar_consentimiento': return 'Registró que un cliente revocó el consentimiento';
        case 'acceso_soporte': return 'El soporte de AUTENZA consultó datos';
        default: return `${accionAuditoriaLabel(log.accion)} · ${entidadAuditoriaLabel(log.entidad)}`;
    }
};

/** "Hoy 14:32", "Ayer 09:10" o "28/10 14:32" (con año si no es el actual). */
export const cuandoAuditoria = (iso: string, ahora: Date = new Date()): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Sin fecha';
    const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const mismoDia = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (mismoDia(d, ahora)) return `Hoy ${hora}`;
    const ayer = new Date(ahora);
    ayer.setDate(ahora.getDate() - 1);
    if (mismoDia(d, ayer)) return `Ayer ${hora}`;
    const fecha = d.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        ...(d.getFullYear() !== ahora.getFullYear() ? { year: 'numeric' } : {}),
    });
    return `${fecha} ${hora}`;
};
