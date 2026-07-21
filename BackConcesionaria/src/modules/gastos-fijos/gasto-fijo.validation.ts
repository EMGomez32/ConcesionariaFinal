import { body, param, query } from 'express-validator';

export const createGastoFijo = [
    body('categoriaId').isInt().withMessage('categoriaId debe ser un entero'),
    body('sucursalId').optional({ nullable: true }).isInt(),
    body('proveedorId').optional({ nullable: true }).isInt(),
    body('anio').isInt({ min: 2000 }).withMessage('anio debe ser un entero válido'),
    body('mes').isInt({ min: 1, max: 12 }).withMessage('mes debe estar entre 1 y 12'),
    body('monto').isDecimal().withMessage('monto debe ser un número'),
    body('moneda').optional().isIn(['ARS', 'USD']).withMessage('moneda debe ser ARS o USD'),
    body('descripcion').notEmpty().withMessage('descripcion es obligatoria'),
    body('comprobanteUrl').optional({ nullable: true, checkFalsy: true }).isString(),
];

export const updateGastoFijo = [
    param('id').isInt().withMessage('id debe ser un entero'),
    body('categoriaId').optional().isInt(),
    body('sucursalId').optional({ nullable: true }).isInt(),
    body('proveedorId').optional({ nullable: true }).isInt(),
    body('anio').optional().isInt({ min: 2000 }),
    body('mes').optional().isInt({ min: 1, max: 12 }),
    body('monto').optional().isDecimal(),
    body('moneda').optional().isIn(['ARS', 'USD']).withMessage('moneda debe ser ARS o USD'),
    body('descripcion').optional().notEmpty(),
    body('comprobanteUrl').optional({ nullable: true, checkFalsy: true }).isString(),
];

export const getGastosFijos = [
    query('categoriaId').optional().isInt(),
    query('sucursalId').optional().isInt(),
    query('anio').optional().isInt(),
    query('mes').optional().isInt(),
    query('limit').optional().isInt(),
    query('page').optional().isInt(),
];

export const getGastoFijoById = [
    param('id').isInt().withMessage('id debe ser un entero'),
];

export const deleteGastoFijo = [
    param('id').isInt().withMessage('id debe ser un entero'),
];
