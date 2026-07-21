import { body } from 'express-validator';

export const createVehiculo = [
    body('sucursalId').isInt().withMessage('sucursalId debe ser un número'),
    body('marca').notEmpty().withMessage('La marca es obligatoria'),
    body('modelo').notEmpty().withMessage('El modelo es obligatorio'),
    body('tipo').isIn(['USADO', 'CERO_KM']).withMessage('Tipo inválido'),
    body('origen').isIn(['compra', 'permuta', 'consignacion', 'otro']).withMessage('Origen inválido'),
    body('estado').optional().isIn(['preparacion', 'publicado', 'reservado', 'vendido', 'devuelto']),
    body('anio').optional().isInt(),
    body('dominio').optional().isString(),
    body('vin').optional().isString(),
    body('kmIngreso').optional().isInt(),
    body('fechaIngreso').isISO8601().withMessage('Fecha de ingreso inválida'),
    body('precioLista').optional().isDecimal(),
    body('precioCompra').optional().isDecimal(),
];

export const updateVehiculo = [
    body('sucursalId').optional().isInt(),
    body('marca').optional().notEmpty(),
    body('modelo').optional().notEmpty(),
    body('estado').optional().isIn(['preparacion', 'publicado', 'reservado', 'vendido', 'devuelto']),
    body('precioLista').optional().isDecimal(),
    body('precioCompra').optional().isDecimal(),
    body('observaciones').optional().isString(),
];
