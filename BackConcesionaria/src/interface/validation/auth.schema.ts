import { z } from 'zod';
import { passwordNueva } from './password';

// Schemas de validación de los endpoints de auth. Conservadores a propósito:
// en login sólo se valida presencia y forma (nunca reglas de complejidad, que
// dejarían afuera a usuarios con contraseñas viejas). El `.trim()` normaliza
// espacios accidentales sin cambiar la lógica de búsqueda por email.
//
// El `{ error }` a nivel de string cubre el caso "campo ausente / tipo inválido"
// con un mensaje en español; los mensajes de `.min()`/`.email()` tienen prioridad
// para sus propios casos (vacío / formato).

export const loginSchema = z.object({
    // `.toLowerCase()`: el email es identidad GLOBAL (schema: @unique). Normalizarlo
    // en el borde hace la unicidad case-insensitive de hecho y evita que 'Admin@x' y
    // 'admin@x' sean cuentas distintas o que el login no matchee por diferencia de case.
    email: z.string({ error: 'El email es obligatorio' }).trim().toLowerCase().min(1, 'El email es obligatorio').email('Email inválido'),
    password: z.string({ error: 'La contraseña es obligatoria' }).min(1, 'La contraseña es obligatoria'),
});

export const refreshSchema = z.object({
    refreshToken: z.string({ error: 'El refresh token es obligatorio' }).min(1, 'El refresh token es obligatorio'),
});

// Logout: el refresh token es opcional a propósito. Cerrar sesión debe ser
// siempre graceful (incluso sin token o con el body vacío); si viene, se revoca.
export const logoutSchema = z.object({
    refreshToken: z.string().optional(),
});

// La política de longitud mínima (10) vive acá, como única fuente de verdad
// (antes estaba hardcodeada en el controller).
export const resetPasswordSchema = z.object({
    token: z.string({ error: 'El token es obligatorio' }).min(1, 'El token es obligatorio'),
    password: passwordNueva(),
});

// ── 2FA (TOTP) ──────────────────────────────────────────────────────────────

const codigoTotp = z.string({ error: 'El código es obligatorio' }).trim().min(1, 'El código es obligatorio').max(12);
const codigoRecuperacion = z.string().trim().min(1).max(20);

// Segundo paso del login: el token de "contraseña correcta" + UN código (TOTP o de recuperación).
export const login2faSchema = z.object({
    mfaToken: z.string({ error: 'Falta el token de verificación' }).min(1, 'Falta el token de verificación'),
    code: codigoTotp.optional(),
    recoveryCode: codigoRecuperacion.optional(),
}).refine((d) => !!d.code !== !!d.recoveryCode, { message: 'Ingresá el código de tu app o un código de recuperación (no ambos)' });

export const mfaSetupSchema = z.object({
    password: z.string({ error: 'La contraseña actual es obligatoria' }).min(1, 'La contraseña actual es obligatoria'),
});

export const mfaEnableSchema = z.object({ code: codigoTotp });

// Desactivar: contraseña + (código de la app O código de recuperación).
export const mfaDisableSchema = z.object({
    password: z.string({ error: 'La contraseña actual es obligatoria' }).min(1, 'La contraseña actual es obligatoria'),
    code: codigoTotp.optional(),
    recoveryCode: codigoRecuperacion.optional(),
}).refine((d) => !!d.code !== !!d.recoveryCode, { message: 'Ingresá el código de tu app o un código de recuperación (no ambos)' });

export const mfaRegenerarSchema = z.object({
    password: z.string({ error: 'La contraseña actual es obligatoria' }).min(1, 'La contraseña actual es obligatoria'),
    code: codigoTotp,
});
