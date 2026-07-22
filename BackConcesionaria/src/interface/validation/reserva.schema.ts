import { z } from 'zod';

// Schemas de validación de reservas. Payloads verificados contra los DTOs reales
// del front (reservas.api.ts):
//   - create: sucursalId, vendedorId, clienteId, vehiculoId, monto, moneda,
//     fechaVencimiento, observaciones?
//   - update: estado?, monto?, fechaVencimiento?, observaciones?
// Se usa `coerce` para aceptar tanto números como strings numéricos sin romper.
// La lista explícita CORTA el mass-assignment: el controller pasa `req.body` crudo
// al use-case (createReservaUC.execute(req.body)), que además INYECTA campos que
// NO deben venir del body y Zod descarta: concesionariaId (se toma del vehículo),
// fecha (new Date()) y estado='activa' en create. `vendedorId` se mapea a
// creadaPorId (el use-case cae al usuario del contexto si falta, pero el DTO del
// front lo manda siempre).

const idField = (label: string) =>
    z.coerce.number({ error: `${label} es obligatorio` }).int(`${label} inválido`).positive(`${label} es obligatorio`);

const montoField = (label: string) =>
    z.coerce.number({ error: `${label} es obligatorio` }).positive(`${label} debe ser mayor a 0`);

const monedaEnum = z.enum(['ARS', 'USD']);
const estadoReservaEnum = z.enum(['activa', 'convertida_en_venta', 'cancelada', 'vencida']);

export const createReservaSchema = z.object({
    sucursalId: idField('La sucursal'),
    vendedorId: idField('El vendedor'),
    clienteId: idField('El cliente'),
    vehiculoId: idField('El vehículo'),
    monto: montoField('El monto de la seña'),
    moneda: monedaEnum,
    fechaVencimiento: z.string({ error: 'La fecha de vencimiento es obligatoria' }).min(1, 'La fecha de vencimiento es obligatoria'),
    observaciones: z.string().optional(),
});

// Update parcial: el front sólo manda lo que cambia, así que todo es opcional.
// `estado` dispara la máquina de estados del use-case (assertValidTransition) y,
// al pasar a cancelada/vencida, libera el vehículo. `fechaVencimiento` se deja SIN
// `.min(1)` a propósito: el use-case interpreta '' como "limpiar el vencimiento"
// (venceEl=null) y hay que preservar ese comportamiento. `moneda` no forma parte
// del DTO de update del front, por lo que se descarta si llega (anti mass-assignment).
export const updateReservaSchema = z.object({
    estado: estadoReservaEnum.optional(),
    monto: montoField('El monto de la seña').optional(),
    fechaVencimiento: z.string().optional(),
    observaciones: z.string().optional(),
});
