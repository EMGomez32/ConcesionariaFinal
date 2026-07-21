import { body } from 'express-validator';

export const createTipoPostventa = [
    body('nombre').trim().notEmpty().withMessage('El nombre es obligatorio')
        .isLength({ max: 60 }).withMessage('El nombre no puede superar los 60 caracteres'),
    body('activo').optional().isBoolean(),
];

export const updateTipoPostventa = [
    body('nombre').optional().trim().notEmpty().withMessage('El nombre no puede quedar vacío')
        .isLength({ max: 60 }).withMessage('El nombre no puede superar los 60 caracteres'),
    body('activo').optional().isBoolean(),
];
