import { z } from 'zod';
import { obligatorio, invalido } from './mensajes';
import { bodyOVacio, motivoObligatorio, motivoOpcional } from './motivo';

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
    z.coerce.number({ error: obligatorio(label) }).int(invalido(label)).positive(obligatorio(label));

const montoField = (label: string) =>
    z.coerce.number({ error: obligatorio(label) }).positive(`${label} debe ser mayor a 0`);

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
//
// `motivo` no es columna: va a la auditoría. Es obligatorio al CANCELAR (PROC-33):
// cancelar una seña es devolver plata y liberar la unidad, y es del admin.
export const updateReservaSchema = z.object({
    estado: estadoReservaEnum.optional(),
    monto: montoField('El monto de la seña').optional(),
    fechaVencimiento: z.string().optional(),
    observaciones: z.string().optional(),
    motivo: motivoOpcional,
}).superRefine((v, ctx) => {
    if (v.estado !== 'cancelada') return;
    const r = motivoObligatorio('de la cancelación').safeParse(v.motivo ?? '');
    if (!r.success) {
        ctx.addIssue({ code: 'custom', path: ['motivo'], message: r.error.issues[0]?.message ?? 'Contá el motivo de la cancelación' });
    }
});

// DELETE /reservas/:id — la cancelación "oficial" (admin). Mismo motivo obligatorio
// que cancelar por PATCH: son la misma operación por dos puertas.
export const cancelarReservaSchema = bodyOVacio(z.object({
    motivo: motivoObligatorio('de la cancelación'),
}));
