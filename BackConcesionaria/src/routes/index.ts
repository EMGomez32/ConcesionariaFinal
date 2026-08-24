import express from 'express';
import authRoutes from '../interface/routes/auth.routes';
import concesionariaRoutes from '../interface/routes/concesionaria.routes';
import sucursalRoutes from '../interface/routes/sucursal.routes';
import usuarioRoutes from '../interface/routes/usuario.routes';
import rolRoutes from '../interface/routes/rol.routes';
import clienteRoutes from '../interface/routes/cliente.routes';
import clienteSeguimientoRoutes from '../interface/routes/cliente-seguimiento.routes';
import tasacionRoutes from '../interface/routes/tasacion.routes';
import vehiculoInteresRoutes from '../interface/routes/vehiculo-interes.routes';
import vehiculoPrecioRoutes from '../interface/routes/vehiculo-precio.routes';
import proveedorRoutes from '../interface/routes/proveedor.routes';
import searchRoutes from '../interface/routes/search.routes';
import vehiculoRoutes from '../interface/routes/vehiculo.routes';
import archivoRoutes from '../interface/routes/vehiculo-archivo.routes';
import movimientoRoutes from '../interface/routes/vehiculo-movimiento.routes';
import ingresoRoutes from '../interface/routes/ingreso-vehiculo.routes';
import reservaRoutes from '../interface/routes/reserva.routes';
import presupuestoRoutes from '../interface/routes/presupuesto.routes';
import ventaRoutes from '../interface/routes/venta.routes';
import gastoRoutes from '../interface/routes/gasto.routes';
import categoriaRoutes from '../interface/routes/categoria-gasto.routes';
import gastoFijoRoutes from '../interface/routes/gasto-fijo.routes';
import categoriaFijoRoutes from '../interface/routes/categoria-gasto-fijo.routes';
import casoRoutes from '../interface/routes/postventa-caso.routes';
import itemRoutes from '../interface/routes/postventa-item.routes';
import tipoPostventaRoutes from '../interface/routes/tipo-postventa.routes';
import financieraRoutes from '../interface/routes/financiera.routes';
import financiacionRoutes from '../interface/routes/financiacion.routes';
import solicitudRoutes from '../interface/routes/solicitud-financiacion.routes';
import whatsappRoutes from '../interface/routes/whatsapp.routes';
import conversacionRoutes from '../interface/routes/conversacion.routes';
import mercadolibreRoutes from '../interface/routes/mercadolibre.routes';
import auditoriaRoutes from '../interface/routes/audit-log.routes';
import billingRoutes from '../interface/routes/billing.routes';
import reporteRoutes from '../interface/routes/reporte.routes';
import cotizacionRoutes from '../interface/routes/cotizacion.routes';
import metaVentaRoutes from '../interface/routes/meta-venta.routes';
import objetivoVendedorRoutes from '../interface/routes/objetivo-vendedor.routes';
import debugRoutes from '../interface/routes/debug.routes';
import { authenticate } from '../interface/middlewares/authenticate.middleware';
import { authorize } from '../interface/middlewares/authorize.middleware';
import { env } from '../config/env';
import ApiResponse from '../utils/ApiResponse';

const router = express.Router();

// ── Rutas públicas (sin autenticación) ───────────────────────────────────────

// Health check
router.get('/health', (req, res) => {
    res.send(ApiResponse.success({ status: 'UP', timestamp: new Date() }));
});

// Debug endpoints: SOLO en desarrollo. Exponen datos internos; no van a prod.
if (env.NODE_ENV === 'development') {
    router.use('/debug', debugRoutes);
}

// Auth (login/refresh/logout son públicos por definición)
router.use('/auth', authRoutes);

// ── A partir de acá, TODO exige autenticación ────────────────────────────────
// Defensa en profundidad: además del RLS a nivel base de datos, ninguna ruta
// de datos responde sin un JWT válido. La autorización por rol se aplica
// adicionalmente en cada router con authorize(...).
router.use(authenticate);

// SaaS Core
router.use('/concesionarias', concesionariaRoutes);
router.use('/sucursales', sucursalRoutes);
router.use('/usuarios', usuarioRoutes);
router.use('/roles', rolRoutes);

// CRM
router.use('/clientes', clienteRoutes);
router.use('/cliente-seguimientos', clienteSeguimientoRoutes);
router.use('/tasaciones', tasacionRoutes);
router.use('/vehiculo-intereses', vehiculoInteresRoutes);
router.use('/proveedores', proveedorRoutes);
router.use('/search', searchRoutes);

// Inventario
router.use('/vehiculos', vehiculoRoutes);
router.use('/vehiculo-archivos', archivoRoutes);
router.use('/vehiculo-movimientos', movimientoRoutes);
router.use('/vehiculo-ingresos', ingresoRoutes);
router.use('/vehiculo-precios', vehiculoPrecioRoutes);

// Operaciones
router.use('/reservas', reservaRoutes);
router.use('/presupuestos', presupuestoRoutes);
router.use('/ventas', ventaRoutes);

// Gastos & Postventa
router.use('/gastos', gastoRoutes);
router.use('/gastos-categorias', categoriaRoutes);
router.use('/gastos-fijos', gastoFijoRoutes);
router.use('/gastos-fijos-categorias', categoriaFijoRoutes);
router.use('/postventa-casos', casoRoutes);
router.use('/postventa-items', itemRoutes);
router.use('/postventa-tipos', tipoPostventaRoutes);

// Financiación
router.use('/financieras', financieraRoutes);
router.use('/financiaciones', financiacionRoutes);
router.use('/financiacion-solicitudes', solicitudRoutes);

// WhatsApp — vinculación de números (admin, gating en el router) y bandeja de
// conversaciones (admin + vendedor; el vendedor puro sólo ve las suyas o las sin
// asignar, recorte que aplica el service).
router.use('/whatsapp', whatsappRoutes);
router.use('/conversaciones', conversacionRoutes);

// Mercado Libre — vinculación OAuth y publicación de unidades (admin), bandeja
// de preguntas (admin + vendedor; el vendedor puro sólo ve las suyas o las sin
// asignar). SIN authorize a nivel de montaje: el gating es por-ruta dentro del
// router, porque leer la publicación de un vehículo la ve todo el equipo. El
// callback de OAuth y las notificaciones de ML son PÚBLICOS y viven en
// webhook.routes.ts (montado fuera de este router, que exige JWT).
router.use('/mercadolibre', mercadolibreRoutes);

// Auditoría — el log expone IP, user-agent y el detalle de cada operación de
// TODOS los usuarios del tenant. Es dato sensible: sólo admin (super_admin
// pasa por el bypass de authorize). Antes cualquier usuario autenticado
// (vendedor incluido) podía leerlo y exportarlo.
router.use('/auditoria', authorize('admin'), auditoriaRoutes);

// Reportes
router.use('/reportes', reporteRoutes);

// Cotización del dólar — la usan los reportes para consolidar totales ARS/USD.
// Lectura: cualquier usuario autenticado. Escritura: solo admin (en el router).
router.use('/cotizaciones', cotizacionRoutes);

// Metas de ventas mensuales — el Dashboard muestra el progreso vs el objetivo.
// Lectura: cualquier autenticado. Escritura: solo admin (en el router).
router.use('/metas', metaVentaRoutes);

// Objetivos por vendedor — performance individual del equipo. La gestión (getAll,
// upsert, delete) es solo admin (expone ventas/facturación del equipo); GET /mio es
// self-service: cualquier autenticado ve SÓLO su propio objetivo. Sin authorize a
// nivel de montaje: el gating es por-ruta dentro del router (ojo al agregar rutas).
router.use('/objetivos-vendedor', objetivoVendedorRoutes);

// SaaS Billing — módulo de facturación/suscripción: solo admin.
router.use('/billing', authorize('admin'), billingRoutes);

export default router;
