import { body } from 'express-validator';

// Los estados viven en el enum EstadoSolicitudFinanciacion del schema (en
// minúscula) y las transiciones las valida la máquina de estados en
// UpdateSolicitud. Acá sólo se chequea que el valor exista.
const ESTADOS = ['borrador', 'enviada', 'pendiente', 'aprobada', 'rechazada', 'cancelada'];

export const createSolicitud = [
    body('clienteId').isInt({ min: 1 }).withMessage('clienteId es obligatorio'),
    body('financieraId').isInt({ min: 1 }).withMessage('financieraId es obligatorio'),
    body('sucursalId').optional({ nullable: true }).isInt({ min: 1 }),
    body('ventaId').optional({ nullable: true }).isInt({ min: 1 }),
    body('presupuestoId').optional({ nullable: true }).isInt({ min: 1 }),
    // Opcional: una pre-aprobación se pide antes de elegir la unidad.
    body('vehiculoId').optional({ nullable: true }).isInt({ min: 1 })
        .withMessage('vehiculoId inválido'),
    body('montoSolicitado').optional({ nullable: true }).isFloat({ min: 0 })
        .withMessage('El monto solicitado no puede ser negativo'),
    body('plazoCuotas').optional({ nullable: true }).isInt({ min: 1 })
        .withMessage('El plazo debe ser de al menos 1 cuota'),
    body('tasaEstimada').optional({ nullable: true }).isFloat({ min: 0 })
        .withMessage('La tasa no puede ser negativa'),
    body('observaciones').optional({ nullable: true }).isString(),
];

export const updateSolicitud = [
    body('estado').optional().isIn(ESTADOS).withMessage(`Estado inválido. Válidos: ${ESTADOS.join(', ')}`),
    body('vehiculoId').optional({ nullable: true }).isInt({ min: 1 })
        .withMessage('vehiculoId inválido'),
    body('montoSolicitado').optional({ nullable: true }).isFloat({ min: 0 }),
    body('plazoCuotas').optional({ nullable: true }).isInt({ min: 1 }),
    body('tasaEstimada').optional({ nullable: true }).isFloat({ min: 0 }),
    body('montoAprobado').optional({ nullable: true }).isFloat({ min: 0 })
        .withMessage('El monto aprobado no puede ser negativo'),
    body('tasaFinal').optional({ nullable: true }).isFloat({ min: 0 })
        .withMessage('La tasa final no puede ser negativa'),
    body('fechaEnvio').optional({ nullable: true }).isISO8601().withMessage('fechaEnvio inválida'),
    body('fechaRespuesta').optional({ nullable: true }).isISO8601().withMessage('fechaRespuesta inválida'),
    body('observaciones').optional({ nullable: true }).isString(),
];
