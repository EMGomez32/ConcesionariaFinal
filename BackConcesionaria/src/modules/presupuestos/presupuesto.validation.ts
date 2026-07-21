import { body } from 'express-validator';

/**
 * Validación de presupuestos, alineada con el model Presupuesto de schema.prisma.
 *
 * El presupuesto NO tiene vehiculoId ni montoTotal: los vehículos van en `items`
 * y el total se deriva de items + extras - canje. La fecha de vencimiento se
 * llama `validoHasta`, y los estados son los del enum EstadoPresupuesto.
 */

const ESTADOS = ['borrador', 'enviado', 'aceptado', 'rechazado', 'vencido', 'cancelado'];

export const createPresupuesto = [
    body('sucursalId').isInt().withMessage('sucursalId debe ser un número'),
    body('clienteId').isInt().withMessage('clienteId debe ser un número'),
    body('vendedorId').isInt().withMessage('vendedorId debe ser un número'),
    body('moneda').optional().isIn(['ARS', 'USD']).withMessage('La moneda debe ser ARS o USD'),
    body('fechaCreacion').isISO8601().withMessage('fechaCreacion debe ser una fecha válida'),
    body('validoHasta').optional({ nullable: true }).isISO8601().withMessage('validoHasta debe ser una fecha válida'),
    body('observaciones').optional({ nullable: true }).isString(),

    body('items').optional().isArray(),
    body('items.*.vehiculoId').isInt().withMessage('Cada ítem necesita un vehiculoId'),
    body('items.*.precioLista').isDecimal().withMessage('precioLista debe ser un número'),
    body('items.*.precioFinal').isDecimal().withMessage('precioFinal debe ser un número'),
    body('items.*.descuento').optional().isDecimal(),

    body('externos').optional().isArray(),
    body('externos.*.descripcion').notEmpty().withMessage('Cada extra necesita una descripción'),
    body('externos.*.monto').isDecimal().withMessage('El monto del extra debe ser un número'),

    // El canje es uno solo por presupuesto (relación 1-1), no un array.
    body('canjes').optional({ nullable: true }).isObject().withMessage('El canje debe ser un objeto'),
    body('canjes.valorTomado').optional().isDecimal().withMessage('valorTomado debe ser un número'),
];

export const updatePresupuesto = [
    body('estado').optional().isIn(ESTADOS).withMessage(`El estado debe ser uno de: ${ESTADOS.join(', ')}`),
    body('observaciones').optional({ nullable: true }).isString(),
    body('validoHasta').optional({ nullable: true }).isISO8601().withMessage('validoHasta debe ser una fecha válida'),
    body('moneda').optional().isIn(['ARS', 'USD']).withMessage('La moneda debe ser ARS o USD'),
];
