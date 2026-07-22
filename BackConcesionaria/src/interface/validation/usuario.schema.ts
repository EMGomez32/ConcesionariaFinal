import { z } from 'zod';

// Schemas de validación del recurso usuario (RBAC — SENSIBLE). Payloads verificados
// contra los DTOs reales del front (usuarios.api.ts, types/usuario.types.ts) y el
// form UsuarioForm.tsx / UsuariosPage.tsx. Se usa z.object por defecto: Zod descarta
// las claves desconocidas => corta el mass-assignment (nadie cuela id/passwordHash,
// ni un admin puede colar concesionariaId por body: el tenant lo inyecta el
// controller desde el token).
//
// CLAVE — el controller (UsuarioController.create) LEE req.body.concesionariaId sólo
// para super_admin, y validate.middleware hace `req.body = result.data`. Por eso
// concesionariaId DEBE declararse (opcional) en el create: si lo strippeáramos, el
// super_admin no podría elegir tenant y el use-case tiraría 'concesionariaId es
// obligatorio'. Para un admin común el campo no viene y lo pone el controller.
// En update aplica el mismo reparto: el schema deja pasar concesionariaId para que
// super_admin pueda REASIGNAR tenant, y UsuarioController.update lo strippea para
// cualquier otro rol (RBAC del controller, no del schema).

// FK opcional: 0 / '' / null se interpretan como "sin FK" (undefined), porque el
// form inicializa sucursalId en 0 y manda `sucursalId || undefined`. Si viene un id
// real, se valida positivo. Mismo patrón que venta.schema.ts.
const optionalFk = z.preprocess(
    (v) => (v === 0 || v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
);

// Elemento de roleIds: el front manda number[], el coerce es red de seguridad.
const roleId = z.coerce.number().int().positive('Rol inválido');

export const createUsuarioSchema = z.object({
    nombre: z.string({ error: 'El nombre es obligatorio' }).min(1, 'El nombre es obligatorio'),
    email: z.string({ error: 'El email es obligatorio' }).trim().min(1, 'El email es obligatorio').email('Email inválido'),
    // El use-case exige y hashea password (min 6). Se centraliza la regla acá.
    password: z.string({ error: 'La contraseña es obligatoria' }).min(6, 'La contraseña debe tener al menos 6 caracteres'),
    // Opcional a propósito: lo inyecta el controller desde el token para un admin;
    // super_admin lo manda por body y tiene que SOBREVIVIR al strip (ver cabecera).
    concesionariaId: optionalFk,
    sucursalId: optionalFk,
    // El form actual no lo manda (Prisma default true), pero el DTO lo permite.
    activo: z.boolean().optional(),
    // .default([]) obligatorio: el repo hace roleIds.map(...) en create; sin array
    // reventaría con un 500. El form siempre lo manda (aunque sea []), esto sólo
    // blinda el caso de que llegue ausente.
    roleIds: z.array(roleId).default([]),
});

// El controller.update strippea roleIds/roles/activo cuando editás TU PROPIA cuenta
// (anti auto-lockout); el schema igual valida su forma, el strip ocurre después.
export const updateUsuarioSchema = z.object({
    nombre: z.string().min(1, 'El nombre no puede estar vacío').optional(),
    email: z.string().trim().min(1, 'El email no puede estar vacío').email('Email inválido').optional(),
    // El form de edición NO renderiza el campo password, pero igual manda
    // password:'' (queda del estado inicial y el padre no lo strippea). '' => undefined
    // para no rechazar el request ni re-hashear; un password real sigue exigiendo min 6.
    password: z.preprocess(
        (v) => (v === '' ? undefined : v),
        z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').optional(),
    ),
    // Opcional para que super_admin pueda REASIGNAR tenant. Un admin común no puede:
    // UsuarioController.update lo strippea salvo super_admin (ver cabecera).
    concesionariaId: optionalFk,
    sucursalId: optionalFk,
    activo: z.boolean().optional(),
    // SIN .default([]): el repo hace `if (roleIds) { deleteMany + create }`. Un []
    // es truthy y BORRARÍA todos los roles del usuario. Debe quedar undefined si no
    // viene, para que el repo no toque los roles.
    roleIds: z.array(roleId).optional(),
});

// POST /usuarios/:id/reset-password — un admin setea la clave de OTRO usuario.
// Nombre distinto de resetPasswordSchema (auth.schema.ts) para no colisionar.
export const resetUsuarioPasswordSchema = z.object({
    password: z.string({ error: 'La contraseña es obligatoria' }).min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

// PATCH /usuarios/me — autogestión. El controller sólo lee nombre y email.
export const updateMeSchema = z.object({
    nombre: z.string().min(1, 'El nombre no puede estar vacío').optional(),
    email: z.string().trim().min(1, 'El email no puede estar vacío').email('Email inválido').optional(),
});

// POST /usuarios/me/password — cambio de la propia clave (verifica la actual).
export const changeMyPasswordSchema = z.object({
    currentPassword: z.string({ error: 'La contraseña actual es obligatoria' }).min(1, 'La contraseña actual es obligatoria'),
    newPassword: z.string({ error: 'La nueva contraseña es obligatoria' }).min(6, 'La nueva contraseña debe tener al menos 6 caracteres'),
});
