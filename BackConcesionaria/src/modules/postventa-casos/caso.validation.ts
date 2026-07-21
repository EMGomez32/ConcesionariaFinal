import { body } from 'express-validator';

// Estados reales del enum EstadoPostventa (prisma/schema.prisma). La versión
// anterior validaba contra ['abierto','en_proceso','esperando_repuestos',
// 'finalizado','cancelado'], que no existen, y pedía 'motivo'/'observaciones',
// que tampoco: cablearla tal cual habría roto el módulo entero.
// Las transiciones permitidas las controla la máquina de estados en UpdateCaso;
// acá sólo se chequea que el valor exista.
const ESTADOS = ['pendiente', 'en_curso', 'resuelto'];

export const createCaso = [
    body('clienteId').isInt({ min: 1 }).withMessage('clienteId es obligatorio'),
    body('vehiculoId').isInt({ min: 1 }).withMessage('vehiculoId es obligatorio'),
    body('sucursalId').isInt({ min: 1 }).withMessage('sucursalId es obligatorio'),
    // Obligatorio en el schema (`ventaId Int`): un reclamo de postventa siempre
    // es sobre una unidad ya vendida. Sin esto el form manda 0 y explota la FK
    // con un 500 en vez de un mensaje entendible.
    body('ventaId').isInt({ min: 1 }).withMessage('Indicá sobre qué venta es el reclamo'),
    body('fechaReclamo').isISO8601().withMessage('fechaReclamo debe ser una fecha válida'),
    body('descripcion').notEmpty().withMessage('La descripción es obligatoria'),
    // El tipo sale del catálogo TipoPostventa (ABM en la pestaña "Tipos de
    // Caso"): antes era texto libre y cualquier variante ortográfica creaba un
    // tipo nuevo. Opcional: puede no saberse al abrir el reclamo.
    body('tipoId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('tipoId inválido'),
];

export const updateCaso = [
    body('estado').optional().isIn(ESTADOS).withMessage(`Estado inválido. Válidos: ${ESTADOS.join(', ')}`),
    body('tipoId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('tipoId inválido'),
    body('descripcion').optional().notEmpty().withMessage('La descripción no puede quedar vacía'),
    body('fechaReclamo').optional().isISO8601(),
    body('fechaCierre').optional({ nullable: true }).isISO8601(),
];
