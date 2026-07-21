import { body } from 'express-validator';

// La versión anterior validaba 'costo' y 'precio', campos que no existen en
// PostventaItem: el importe real es `monto`, y `fecha` es obligatoria.
export const createItem = [
    body('casoId').isInt({ min: 1 }).withMessage('casoId es obligatorio'),
    body('fecha').isISO8601().withMessage('fecha debe ser una fecha válida'),
    body('descripcion').notEmpty().withMessage('La descripción es obligatoria'),
    body('monto').isDecimal().withMessage('monto debe ser un número')
        .custom((v) => Number(v) >= 0).withMessage('El monto no puede ser negativo'),
    body('proveedorId').optional({ nullable: true }).isInt({ min: 1 }),
    body('comprobanteUrl').optional({ nullable: true, checkFalsy: true }).isString(),
];
