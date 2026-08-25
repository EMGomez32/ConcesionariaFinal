import { useAuthStore } from '../store/authStore';

/**
 * Espejo en el front de los `authorize(...)` del backend.
 *
 * POR QUÉ EXISTE: el servidor es el que manda —las rutas que mutan llevan
 * `authorize(...)` y ahí no se pasa nadie—, pero un control que siempre termina en
 * 403 es un botón muerto, y un botón muerto es peor que ningún botón. El vendedor
 * confirma un diálogo que le promete "esto revierte el stock y anula los cobros",
 * recibe un cartel de error, reintenta tres veces y abre un ticket. Y el perfil
 * `lectura` —que /capacitacion vende como "mira y no toca"— veía un tacho rojo en
 * cada fila de la lista de ventas.
 *
 * Esto NO es seguridad: es que la pantalla diga la verdad sobre lo que el servidor
 * va a aceptar. Si alguien borra este archivo, no se abre ningún agujero; se vuelve
 * a llenar de botones que dan 403.
 *
 * REGLA AL TOCAR ESTO: cada campo de abajo nombra la ruta del backend que espeja.
 * Si cambiás un `authorize(...)` allá, cambiá el campo de acá en la misma pasada —
 * y si acá cerrás algo que el servidor SÍ permite, le estás sacando trabajo a un
 * rol sin decírselo a nadie, que es el error opuesto y no lo caza ningún test.
 */

const ADMIN = ['admin', 'super_admin'];

export interface Permisos {
    /** Roles crudos del usuario logueado. Para casos que no valga la pena nombrar. */
    roles: string[];
    tiene: (...roles: string[]) => boolean;
    esAdmin: boolean;

    // ── Ventas ───────────────────────────────────────────────────────────────
    /** POST /ventas, PATCH /ventas/:id, POST /ventas/:id/extras|canjes|factura */
    ventasOperar: boolean;
    /** DELETE /ventas/:id — "Anular Venta". Anular es del administrador. */
    ventasAnular: boolean;
    /** POST /ventas/:id/pagos — el cobrador cobra. */
    ventasCobrar: boolean;
    /** PATCH /ventas/:id/estado-entrega hacia adelante (autorizada/entregada). */
    ventasAvanzarEntrega: boolean;
    /**
     * PATCH /ventas/:id/estado-entrega con destino `cancelada` — "Anular Operación".
     * Es la misma ruta que avanzar la entrega, pero el destino se acota por rol en
     * el controller: `cancelada` es terminal y no revierte el stock.
     */
    ventasCancelarOperacion: boolean;
    /** DELETE /ventas/:id/pagos/:pagoId y /canjes/:canjeId — plata cobrada y el usado tomado. */
    ventasQuitarPagoOCanje: boolean;
    /** DELETE /ventas/:id/extras/:extraId — corrección de carga, no anulación. */
    ventasQuitarExtra: boolean;

    // ── Reservas ─────────────────────────────────────────────────────────────
    /** POST /reservas y PATCH /reservas/:id (incluye cancelar la seña). */
    reservasOperar: boolean;

    // ── Financiación ─────────────────────────────────────────────────────────
    /** POST /financiaciones, PATCH /financiaciones/:id, POST /:id/refinanciar */
    financiacionOperar: boolean;
    /** DELETE /financiaciones/:id — "Anular Contrato". */
    financiacionAnular: boolean;
    /** PATCH /financiaciones/cuotas/:cuotaId/pagar */
    financiacionCobrarCuota: boolean;

    // ── Inventario ───────────────────────────────────────────────────────────
    /** POST /vehiculo-ingresos */
    ingresosCrear: boolean;
    /** DELETE /vehiculo-ingresos/:id — borra el ingreso con su monto de compra. */
    ingresosAnular: boolean;
    /** POST /vehiculo-movimientos */
    movimientosCrear: boolean;
    /** PATCH /vehiculo-movimientos/:id/retorno — recibir la unidad que vuelve del taller. */
    movimientosMarcarRetorno: boolean;
    /** POST /vehiculo-archivos y /upload */
    archivosSubir: boolean;
    /** DELETE /vehiculo-archivos/:id */
    archivosBorrar: boolean;
    /** PATCH /vehiculo-archivos/:id/principal — la portada es decisión comercial. */
    archivosMarcarPrincipal: boolean;

    // ── CRM ──────────────────────────────────────────────────────────────────
    /** GET/POST/PATCH/DELETE /cliente-seguimientos — la bitácora de la negociación. */
    seguimientosVer: boolean;

    // ── Datos sensibles ──────────────────────────────────────────────────────
    /**
     * En un ingreso por compra, `valorTomado` ES el precio de compra de la unidad.
     * El backend se lo recorta a quien no sea admin/vendedor
     * (IngresoVehiculoController.sanitizarValorTomado): sin ese recorte, cruzar
     * `GET /vehiculo-ingresos` con `GET /ventas` por vehiculoId reconstruía el
     * margen unidad por unidad, que es lo que /reportes/rentabilidad reserva a admin.
     */
    veValorDeIngreso: boolean;

    /**
     * El backend borra `precioCompra` para no-admin en las DOS pantallas donde
     * aparece: la ficha del proveedor (ProveedorController.sanitizarVehiculosComprados)
     * y la del vehículo (VehiculoController.sanitizarDatosDeCompra, que se lleva
     * también `fechaCompra`). Sin esto, la columna y la tarjeta quedarían
     * mostrando "—" a todo el mundo, que es peor que no mostrarlas.
     *
     * Ojo: acá el flag NO espeja un `authorize` de ruta como el resto del archivo
     * —`GET /vehiculos` es para todo el equipo— sino un recorte campo por campo.
     */
    vePrecioDeCompra: boolean;
}

export function usePermisos(): Permisos {
    const user = useAuthStore((s) => s.user);
    const roles = user?.roles ?? [];
    const tiene = (...pedidos: string[]) => pedidos.some((r) => roles.includes(r));

    const esAdmin = tiene(...ADMIN);
    const esVendedor = tiene('vendedor');
    const esCobrador = tiene('cobrador');
    const esPostventa = tiene('postventa');

    return {
        roles,
        tiene,
        esAdmin,

        ventasOperar: esAdmin || esVendedor,
        ventasAnular: esAdmin,
        ventasCobrar: esAdmin || esVendedor || esCobrador,
        ventasAvanzarEntrega: esAdmin || esVendedor || esPostventa,
        ventasCancelarOperacion: esAdmin,
        ventasQuitarPagoOCanje: esAdmin,
        ventasQuitarExtra: esAdmin || esVendedor,

        reservasOperar: esAdmin || esVendedor,

        financiacionOperar: esAdmin || esVendedor || esCobrador,
        financiacionAnular: esAdmin,
        financiacionCobrarCuota: esAdmin || esVendedor || esCobrador,

        ingresosCrear: esAdmin || esVendedor,
        ingresosAnular: esAdmin,
        movimientosCrear: esAdmin || esVendedor,
        movimientosMarcarRetorno: esAdmin || esVendedor || esPostventa,
        archivosSubir: esAdmin || esVendedor || esPostventa,
        archivosBorrar: esAdmin || esVendedor || esPostventa,
        archivosMarcarPrincipal: esAdmin || esVendedor,

        seguimientosVer: esAdmin || esVendedor,

        veValorDeIngreso: esAdmin || esVendedor,
        vePrecioDeCompra: esAdmin,
    };
}
