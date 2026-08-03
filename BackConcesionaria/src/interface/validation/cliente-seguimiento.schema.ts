import { z } from 'zod';

// Validación de la bitácora de seguimiento del cliente. z.object descarta lo no
// declarado (corta mass-assignment: el repo pasa el body a prisma.create). NO se
// declara `usuarioId` a propósito: lo estampa el use case desde el token, no el
// cliente. `concesionariaId` sí (opcional) para que el super_admin elija tenant.

// Espejo del enum TipoSeguimiento (prisma/schema.prisma). Mismo criterio que el
// resto de la validación (z.enum de literales, no z.nativeEnum).
const tipoEnum = z.enum(['llamada', 'whatsapp', 'email', 'visita', 'otro'], {
    error: 'Tipo inválido. Válidos: llamada, whatsapp, email, visita, otro',
});

// concesionariaId: la resuelve el controller desde el token (admin) o la elige el
// super_admin por body. 0/''/null => undefined.
const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

// Fecha del próximo contacto: opcional; '' se colapsa a undefined (sin próximo
// contacto). El repo hace new Date() salvo null. El front manda 'YYYY-MM-DD'.
const nullableFecha = () =>
    z.preprocess((v) => (v === '' ? undefined : v), z.string().nullable().optional());

export const createSeguimientoSchema = z.object({
    clienteId: z.coerce.number({ error: 'clienteId es obligatorio' }).int('clienteId inválido').positive('clienteId inválido'),
    tipo: tipoEnum,
    fecha: z.string({ error: 'La fecha es obligatoria' }).min(1, 'La fecha es obligatoria'),
    nota: z.string({ error: 'La nota es obligatoria' }).min(1, 'La nota es obligatoria'),
    proximoContacto: nullableFecha(),
    concesionariaId: optionalFk,
});

// Marcar el próximo contacto como realizado. `hecho` opcional (default true en el
// controller): PATCH sin body ⇒ marcar hecho; { hecho:false } ⇒ reabrir. El
// preprocess colapsa un body ausente (undefined/null; Express 5 ya no lo defaultea
// a {}) a {} para que el atajo "sin body" no reviente con un 400.
export const marcarProximoSchema = z.preprocess(
    (v) => (v == null ? {} : v),
    z.object({ hecho: z.boolean().optional() }),
);
