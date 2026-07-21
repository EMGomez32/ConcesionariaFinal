import { body } from 'express-validator';

// `checkFalsy` es obligatorio acá: el formulario manda `email: ''` cuando el
// campo se deja en blanco, y sin esto express-validator lo toma como "presente"
// y falla con "Email inválido". Un cliente sin email es lo normal.
const emailOpcional = () =>
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Email inválido');

export const createCliente = [
    body('nombre').notEmpty().withMessage('El nombre es obligatorio'),
    body('dni').optional().isString(),
    body('telefono').optional().isString(),
    emailOpcional(),
    body('direccion').optional().isString(),
    body('observaciones').optional().isString(),
];

export const updateCliente = [
    body('nombre').optional().notEmpty().withMessage('El nombre no puede estar vacío'),
    body('dni').optional().isString(),
    body('telefono').optional().isString(),
    emailOpcional(),
    body('direccion').optional().isString(),
    body('observaciones').optional().isString(),
];
