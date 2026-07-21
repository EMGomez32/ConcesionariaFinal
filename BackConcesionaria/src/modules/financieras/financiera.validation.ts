import { body } from 'express-validator';

const TIPOS = ['financiera', 'banco', 'otra'];

// `checkFalsy`: el formulario manda '' cuando el campo queda en blanco; sin esto
// express-validator lo toma como presente y rechaza el alta con "Email inválido".
const emailOpcional = () =>
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Email inválido');

export const createFinanciera = [
    body('nombre').notEmpty().withMessage('El nombre es obligatorio'),
    body('tipo').optional().isIn(TIPOS).withMessage(`Tipo inválido. Válidos: ${TIPOS.join(', ')}`),
    body('contacto').optional().isString(),
    body('telefono').optional().isString(),
    emailOpcional(),
    body('activo').optional().isBoolean(),
];

export const updateFinanciera = [
    body('nombre').optional().notEmpty().withMessage('El nombre no puede estar vacío'),
    body('tipo').optional().isIn(TIPOS).withMessage(`Tipo inválido. Válidos: ${TIPOS.join(', ')}`),
    body('contacto').optional().isString(),
    body('telefono').optional().isString(),
    emailOpcional(),
    body('activo').optional().isBoolean(),
];
