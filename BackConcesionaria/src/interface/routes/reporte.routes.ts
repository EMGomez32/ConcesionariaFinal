import { Router } from 'express';
import { ReporteController } from '../controllers/ReporteController';
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
router.get('/caja', authorize('admin', 'vendedor'), ReporteController.caja);

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
router.get('/mora', authorize('admin', 'vendedor'), ReporteController.mora);

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
router.get('/proximos-vencimientos', authorize('admin', 'vendedor'), ReporteController.proximosVencimientos);

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

export default router;
