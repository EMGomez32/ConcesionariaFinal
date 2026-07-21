import { body } from 'express-validator';

// `checkFalsy`: el formulario manda `email: ''` cuando se deja en blanco y sin
// esto express-validator lo valida igual y rechaza el alta con "Email inválido".
const emailOpcional = () =>
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Email inválido');

export const createProveedor = [
    body('nombre').notEmpty().withMessage('El nombre es obligatorio'),
    body('tipo').optional().isString(),
    body('telefono').optional().isString(),
    emailOpcional(),
    body('direccion').optional().isString(),
    body('activo').optional().isBoolean(),
];

export const updateProveedor = [
    body('nombre').optional().notEmpty().withMessage('El nombre no puede estar vacío'),
    body('tipo').optional().isString(),
    body('telefono').optional().isString(),
    emailOpcional(),
    body('direccion').optional().isString(),
    body('activo').optional().isBoolean(),
];
