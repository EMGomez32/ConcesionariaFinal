import { z } from 'zod';

// Schemas de validación de los endpoints de auth. Conservadores a propósito:
// en login sólo se valida presencia y forma (nunca reglas de complejidad, que
// dejarían afuera a usuarios con contraseñas viejas). El `.trim()` normaliza
// espacios accidentales sin cambiar la lógica de búsqueda por email.
//
// El `{ error }` a nivel de string cubre el caso "campo ausente / tipo inválido"
// con un mensaje en español; los mensajes de `.min()`/`.email()` tienen prioridad
// para sus propios casos (vacío / formato).

export const loginSchema = z.object({
    email: z.string({ error: 'El email es obligatorio' }).trim().min(1, 'El email es obligatorio').email('Email inválido'),
    password: z.string({ error: 'La contraseña es obligatoria' }).min(1, 'La contraseña es obligatoria'),
});

export const refreshSchema = z.object({
    refreshToken: z.string({ error: 'El refresh token es obligatorio' }).min(1, 'El refresh token es obligatorio'),
});

// La política de longitud mínima (10) vive acá, como única fuente de verdad
// (antes estaba hardcodeada en el controller).
export const resetPasswordSchema = z.object({
    token: z.string({ error: 'El token es obligatorio' }).min(1, 'El token es obligatorio'),
    password: z.string({ error: 'La contraseña es obligatoria' }).min(10, 'La contraseña debe tener al menos 10 caracteres'),
});
