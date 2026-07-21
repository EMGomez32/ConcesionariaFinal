import { body } from 'express-validator';

export const createSucursal = [
    body('nombre').notEmpty().withMessage('El nombre es obligatorio'),
    body('direccion').optional().isString(),
    body('telefono').optional().isString(),
    // concesionariaId NO se valida ni se acepta del body: es el tenant y sale
    // del token. Exigirlo acá hacía que crear una sucursal fuera imposible.
];

export const updateSucursal = [
    body('nombre').optional().notEmpty().withMessage('El nombre no puede estar vacío'),
    body('direccion').optional().isString(),
    body('telefono').optional().isString(),
    body('activo').optional().isBoolean(),
];
