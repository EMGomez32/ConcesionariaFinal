import { Router } from 'express';
import { ReporteController } from '../controllers/ReporteController';
import { ComprobanteController } from '../controllers/ComprobanteController';
import { authorize } from '../middlewares/authorize.middleware';

const router = Router();

// `authenticate` ya es global (routes/index.ts), pero eso sólo probaba que HAY
// un usuario: sin authorize, cualquier rol —incluido 'lectura'— leía los
// márgenes del negocio. Ventas, caja y mora son operativos y los usa el
// vendedor; rentabilidad muestra el precio de compra y el margen por unidad, así
// que queda sólo para admin (super_admin bypassea todo por el propio authorize).

/**
 * @openapi
 * /reportes/ventas:
 *   get:
 *     tags: [Reportes]
 *     summary: Ventas por período
 *     description: Lista de ventas filtrable por fecha, sucursal y vendedor, con totales. Usar ?format=csv para descargar.
 *     parameters:
 *       - { in: query, name: desde, schema: { type: string, format: date } }
 *       - { in: query, name: hasta, schema: { type: string, format: date } }
 *       - { in: query, name: sucursalId, schema: { type: integer } }
 *       - { in: query, name: vendedorId, schema: { type: integer } }
 *       - { in: query, name: format, schema: { type: string, enum: [csv] } }
 */
router.get('/ventas', authorize('admin', 'vendedor'), ReporteController.ventas);

/**
 * @openapi
 * /reportes/caja:
 *   get:
 *     tags: [Reportes]
 *     summary: Caja mensual (ingresos vs egresos)
 *     description: Cobros de ventas y cuotas contra gastos de vehículos y fijos del mes. Usar ?format=csv para descargar.
 *     parameters:
 *       - { in: query, name: anio, schema: { type: integer } }
 *       - { in: query, name: mes, schema: { type: integer } }
 *       - { in: query, name: format, schema: { type: string, enum: [csv] } }
 */
router.get('/caja', authorize('admin', 'vendedor', 'cobrador'), ReporteController.caja);

/**
 * @openapi
 * /reportes/mora:
 *   get:
 *     tags: [Reportes]
 *     summary: Cartera de mora
 *     description: Cuotas vencidas con saldo pendiente, con días de atraso por cliente. Usar ?format=csv para descargar.
 *     parameters:
 *       - { in: query, name: format, schema: { type: string, enum: [csv] } }
 */
router.get('/mora', authorize('admin', 'vendedor', 'cobrador'), ReporteController.mora);

/**
 * @openapi
 * /reportes/rentabilidad:
 *   get:
 *     tags: [Reportes]
 *     summary: Rentabilidad por vehículo vendido
 *     description: Precio de venta menos costo (compra + gastos) por vehículo. Usar ?format=csv para descargar.
 *     parameters:
 *       - { in: query, name: desde, schema: { type: string, format: date } }
 *       - { in: query, name: hasta, schema: { type: string, format: date } }
 *       - { in: query, name: sucursalId, schema: { type: integer } }
 *       - { in: query, name: format, schema: { type: string, enum: [csv] } }
 */
router.get('/rentabilidad', authorize('admin'), ReporteController.rentabilidad);

/**
 * @openapi
 * /reportes/proximos-vencimientos:
 *   get:
 *     tags: [Reportes]
 *     summary: Cuotas por vencer (próximos N días)
 *     description: El espejo proactivo de la mora — cuotas que vencen dentro de la ventana, para cobrar antes de que caigan. Usar ?format=csv para descargar.
 *     parameters:
 *       - { in: query, name: dias, schema: { type: integer, default: 7, minimum: 1, maximum: 90 } }
 *       - { in: query, name: consolidar, schema: { type: string, enum: [ARS, USD] } }
 *       - { in: query, name: format, schema: { type: string, enum: [csv] } }
 */
router.get('/proximos-vencimientos', authorize('admin', 'vendedor', 'cobrador'), ReporteController.proximosVencimientos);

/**
 * @openapi
 * /reportes/stock-antiguedad:
 *   get:
 *     tags: [Reportes]
 *     summary: Antigüedad del stock (distribución + estancados)
 *     description: Unidades en stock por antigüedad y capital inmovilizado de las estancadas (> umbral días). Expone precio de compra, por eso es solo admin.
 *     parameters:
 *       - { in: query, name: umbral, schema: { type: integer, default: 60, minimum: 1, maximum: 3650 } }
 *       - { in: query, name: consolidar, schema: { type: string, enum: [ARS, USD] } }
 */
router.get('/stock-antiguedad', authorize('admin'), ReporteController.stockAntiguedad);

/**
 * @openapi
 * /reportes/ranking-vendedores:
 *   get:
 *     tags: [Reportes]
 *     summary: Ranking de vendedores por período
 *     description: Unidades, facturado y rentabilidad por vendedor. Expone márgenes y facturación, por eso es solo admin. Usar ?format=csv para descargar.
 *     parameters:
 *       - { in: query, name: desde, schema: { type: string, format: date } }
 *       - { in: query, name: hasta, schema: { type: string, format: date } }
 *       - { in: query, name: sucursalId, schema: { type: integer } }
 *       - { in: query, name: consolidar, schema: { type: string, enum: [ARS, USD] } }
 *       - { in: query, name: format, schema: { type: string, enum: [csv] } }
 */
router.get('/ranking-vendedores', authorize('admin'), ReporteController.rankingVendedores);

/**
 * @openapi
 * /reportes/comisiones:
 *   get:
 *     tags: [Reportes]
 *     summary: Liquidación de comisiones por vendedor
 *     description: Por vendedor, su % (de su perfil), unidades, facturado y comisión, por moneda. Datos de nómina, solo admin. Usar ?format=csv para descargar.
 *     parameters:
 *       - { in: query, name: desde, schema: { type: string, format: date } }
 *       - { in: query, name: hasta, schema: { type: string, format: date } }
 *       - { in: query, name: sucursalId, schema: { type: integer } }
 *       - { in: query, name: consolidar, schema: { type: string, enum: [ARS, USD] } }
 *       - { in: query, name: format, schema: { type: string, enum: [csv] } }
 */
router.get('/comisiones', authorize('admin'), ReporteController.comisiones);

/**
 * @openapi
 * /reportes/estado-cuenta:
 *   get:
 *     tags: [Reportes]
 *     summary: Estado de cuenta de un cliente
 *     description: Deuda del cliente por financiación (progreso, saldo, vencidas) y totales. El vendedor lo usa al atender al cliente.
 *     parameters:
 *       - { in: query, name: clienteId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Estado de cuenta }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/estado-cuenta', authorize('admin', 'vendedor'), ReporteController.estadoCuenta);

/**
 * @openapi
 * /reportes/ventas-mensuales:
 *   get:
 *     tags: [Reportes]
 *     summary: Tendencia de ventas (serie mensual)
 *     description: Unidades vendidas y facturado por mes en los últimos N meses. Alimenta el gráfico de tendencia del Dashboard.
 *     parameters:
 *       - { in: query, name: meses, schema: { type: integer, default: 6, minimum: 1, maximum: 24 } }
 *       - { in: query, name: consolidar, schema: { type: string, enum: [ARS, USD] } }
 */
router.get('/ventas-mensuales', authorize('admin', 'vendedor'), ReporteController.ventasMensuales);

/**
 * @openapi
 * /reportes/reservas-por-vencer:
 *   get:
 *     tags: [Reportes]
 *     summary: Reservas activas por vencer (próximos N días)
 *     description: Reservas cuya seña vence pronto — hay que cerrar la venta o liberar el vehículo.
 *     parameters:
 *       - { in: query, name: dias, schema: { type: integer, default: 7, minimum: 1, maximum: 90 } }
 *       - { in: query, name: consolidar, schema: { type: string, enum: [ARS, USD] } }
 */
router.get('/reservas-por-vencer', authorize('admin', 'vendedor'), ReporteController.reservasPorVencer);

/**
 * @openapi
 * /reportes/turnos-taller:
 *   get:
 *     tags: [Reportes]
 *     summary: Turnos de taller por venir (postventa, próximos N días)
 *     description: Casos de postventa no resueltos con turno agendado dentro de la ventana, para el centro de alertas del Dashboard.
 *     parameters:
 *       - { in: query, name: dias, schema: { type: integer, default: 7, minimum: 1, maximum: 90 } }
 */
router.get('/turnos-taller', authorize('admin', 'vendedor', 'postventa'), ReporteController.turnosTaller);

/**
 * @openapi
 * /reportes/proximos-service:
 *   get:
 *     tags: [Reportes]
 *     summary: Próximos service/mantenimiento de postventa (retención)
 *     description: Casos con un próximo service agendado en los próximos N días. admin/vendedor/postventa.
 *     parameters:
 *       - { in: query, name: dias, schema: { type: integer, default: 30 } }
 *     responses:
 *       200: { description: Casos con próximo service por venir }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/proximos-service', authorize('admin', 'vendedor', 'postventa'), ReporteController.proximosService);

/**
 * @openapi
 * /reportes/alertas-resumen:
 *   get:
 *     tags: [Reportes]
 *     summary: Resumen de alertas (sólo conteos) para la campanita de notificaciones
 *     description: Una sola llamada con los conteos de mora, cuotas y reservas por vencer, stock estancado y turnos de taller. Solo admin (incluye stock, que expone capital).
 *     responses:
 *       200: { description: Conteos de alertas }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/alertas-resumen', authorize('admin'), ReporteController.alertasResumen);

/**
 * @openapi
 * /reportes/proximos-seguimientos:
 *   get:
 *     tags: [Reportes]
 *     summary: Próximos seguimientos del CRM (agenda de contactos, ventana ±N días)
 *     description: Contactos de la bitácora con proximoContacto agendado entre hoy−N y hoy+N días (vencidos recientes + hoy + próximos), para la agenda de seguimiento. Solo admin/vendedor.
 *     parameters:
 *       - { in: query, name: dias, schema: { type: integer, default: 7, minimum: 1, maximum: 90 } }
 *     responses:
 *       200: { description: Agenda de próximos seguimientos }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/proximos-seguimientos', authorize('admin', 'vendedor'), ReporteController.proximosSeguimientos);

/**
 * @openapi
 * /reportes/leads-resumen:
 *   get:
 *     tags: [Reportes]
 *     summary: Embudo de leads (cantidad de clientes por etapa del pipeline)
 *     description: Conteo de clientes por estado (nuevo/contactado/negociando/ganado/perdido) + total. Solo admin/vendedor.
 *     responses:
 *       200: { description: Conteos por etapa }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/leads-resumen', authorize('admin', 'vendedor'), ReporteController.leadsResumen);

/**
 * @openapi
 * /reportes/postventa:
 *   get:
 *     tags: [Reportes]
 *     summary: Analítica de postventa (casos por estado/tipo, tiempo de resolución, costo)
 *     description: Casos reclamados en el período con métricas del taller. Admin, vendedor y postventa.
 *     parameters:
 *       - { in: query, name: desde, schema: { type: string, format: date } }
 *       - { in: query, name: hasta, schema: { type: string, format: date } }
 *       - { in: query, name: sucursalId, schema: { type: integer } }
 *       - { in: query, name: format, schema: { type: string, enum: [csv] } }
 *     responses:
 *       200: { description: Métricas de postventa }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/postventa', authorize('admin', 'vendedor', 'postventa'), ReporteController.postventa);

/**
 * @openapi
 * /reportes/vencimientos-documentacion:
 *   get:
 *     tags: [Reportes]
 *     summary: Vehículos en stock con VTV / seguro vencido o por vencer
 *     description: Documentación del vehículo por vencer dentro de N días, para el centro de alertas. Admin y vendedor.
 *     parameters:
 *       - { in: query, name: dias, schema: { type: integer, default: 30, minimum: 1, maximum: 90 } }
 *     responses:
 *       200: { description: Vehículos con documentación por vencer }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/vencimientos-documentacion', authorize('admin', 'vendedor', 'postventa'), ReporteController.vencimientosDocumentacion);

/**
 * @openapi
 * /reportes/comisiones/pdf:
 *   get:
 *     tags: [Reportes]
 *     summary: Liquidación de comisiones de un vendedor en PDF (nómina, branded)
 *     description: Detalle de las ventas del vendedor en el período y su comisión por moneda. Solo admin.
 *     parameters:
 *       - { in: query, name: vendedorId, required: true, schema: { type: integer } }
 *       - { in: query, name: desde, schema: { type: string, format: date } }
 *       - { in: query, name: hasta, schema: { type: string, format: date } }
 *     responses:
 *       200: { description: PDF de la liquidación, content: { application/pdf: {} } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/comisiones/pdf', authorize('admin'), ComprobanteController.comisionesLiquidacionPdf);

export default router;
