import { z } from 'zod';

// Schemas de validación de usuarios (fase 3 del rollout de Zod, después de auth y
// ventas). Igual que en ventas, la lista explícita de campos CORTA el
// mass-assignment: tanto el use-case como el repo hacen `...data` sobre el body
// crudo, así que sin validar se podían inyectar columnas sensibles directo a
// Prisma (id, passwordHash, deletedAt, createdAt). Zod descarta todo lo no
// declarado y deja el objeto tipado.
//
// OJO — `concesionariaId` se declara OPCIONAL a propósito: super_admin lo usa para
// elegir el tenant destino al crear y para REASIGNAR tenant al editar. Por eso la
// validación NO puede cerrar el cross-tenant sola: que un admin común no pueda
// pisarlo es RBAC del controller (UsuarioController fuerza/strippea el tenant del
// actor salvo super_admin). El schema deja pasar el campo; el candado vive arriba.

const rolField = z.coerce
    .number({ error: 'El rol es obligatorio' })
    .int('Rol inválido')
    .positive('Rol inválido');

// FK opcional: 0 / '' / null se interpretan como "sin FK" (undefined). El form
// inicializa sucursalId en 0 cuando no se eligió, y concesionariaId sólo lo manda
// super_admin. Si viene un id real, se valida entero positivo.
const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

// Password opcional que trata '' como ausente: el form de edición reusa el mismo
// state y manda `password: ''` cuando NO se cambia (el use-case ya lo ignoraba).
// Si viene una real, mínimo 6 (misma política que CreateUsuario / ResetPassword).
const optionalPassword = z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').optional(),
);

export const createUsuarioSchema = z.object({
    nombre: z.string({ error: 'El nombre es obligatorio' }).trim().min(1, 'El nombre es obligatorio'),
    email: z.string({ error: 'El email es obligatorio' }).trim().min(1, 'El email es obligatorio').email('Email inválido'),
    password: z.string({ error: 'La contraseña es obligatoria' }).min(6, 'La contraseña debe tener al menos 6 caracteres'),
    // super_admin lo manda para elegir el tenant destino; para un admin lo inyecta
    // el controller desde el token (y se ignora el body → sin fuga cross-tenant).
    concesionariaId: optionalFk,
    sucursalId: optionalFk,
    activo: z.boolean().optional(),
    // Default [] para no reventar el repo (`roleIds.map`) si el caller lo omite:
    // 400 limpio o usuario sin roles, nunca un 500.
    roleIds: z.array(rolField).default([]),
});

export const updateUsuarioSchema = z.object({
    nombre: z.string().trim().min(1, 'El nombre no puede quedar vacío').optional(),
    email: z.string().trim().min(1, 'El email no puede quedar vacío').email('Email inválido').optional(),
    password: optionalPassword,
    // Opcional para que super_admin pueda REASIGNAR tenant. Un admin común no puede:
    // el controller lo strippea (RBAC), no el schema.
    concesionariaId: optionalFk,
    sucursalId: optionalFk,
    activo: z.boolean().optional(),
    roleIds: z.array(rolField).optional(),
});
