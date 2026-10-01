import { z } from 'zod';

/**
 * Política de contraseñas NUEVAS (alta de usuario, reset por admin, cambio propio, reset por enlace).
 * El LOGIN no la aplica nunca: dejaría afuera a quien ya tiene una contraseña vieja.
 *
 *  - Mínimo 10 caracteres (antes 6 en tres de los cuatro flujos y 10 sólo en el reset por enlace).
 *  - Máximo 72 BYTES: bcrypt trunca en 72 bytes, así que una contraseña más larga no sumaría
 *    seguridad (y dos contraseñas que difieren sólo después del byte 72 serían la misma).
 *  - Fuera las contraseñas más comunes. Es una lista corta de las que de verdad se prueban primero;
 *    no reemplaza a un buen medidor, pero corta lo peor.
 */

const COMUNES = new Set([
    '1234567890', '12345678910', '0123456789', '1234512345', '0987654321', '1111111111', '0000000000',
    '1q2w3e4r5t', '1q2w3e4r5t6y', 'qwertyuiop', 'asdfghjkl1', 'asdfghjkl;', 'zxcvbnm123', 'qwerty1234',
    'qwerty12345', 'qwertyuiop1', 'abcdefghij', 'abcd123456', 'abc1234567', 'abcde12345',
    'password1', 'password12', 'password123', 'password1234', 'password12345', 'passw0rd123', 'p@ssw0rd123',
    'contrasena1', 'contrasena12', 'contrasena123', 'contrasena1234', 'contraseña1', 'contraseña12', 'contraseña123',
    'clave12345', 'clave123456', 'clave1234567', 'mipassword', 'mipassword1', 'mipassword123', 'miclave1234',
    'bienvenido1', 'bienvenido12', 'bienvenido123', 'argentina123', 'argentina1234', 'argentina2024', 'argentina2025',
    'boca123456', 'riverplate1', 'riverplate12', 'bocajuniors', 'bocajuniors1', 'messi101010',
    'autenza123', 'autenza1234', 'autenza12345', 'autenza2024', 'autenza2025', 'autenza2026',
    'concesionaria', 'concesionaria1', 'concesionaria123', 'administrador', 'administrador1', 'administrador123',
    'admin12345', 'admin123456', 'admin1234567', 'superadmin1', 'superadmin12', 'superadmin123',
    'changeme123', 'changeme1234', 'letmein1234', 'welcome1234', 'welcome12345', 'iloveyou123', 'trustno1234',
    'cambiame123', 'cambiame1234', 'cambiar1234', 'cambiar12345', 'temporal123', 'temporal1234',
]);

/** Para tests y mensajes: ¿es una contraseña de las comunes? */
export const esContrasenaComun = (p: string): boolean => COMUNES.has(p.toLowerCase());

export const passwordNueva = (error = 'La contraseña es obligatoria') =>
    z.string({ error })
        .min(10, 'La contraseña debe tener al menos 10 caracteres')
        .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, { message: 'La contraseña es demasiado larga (máximo 72 bytes)' })
        .refine((p) => !esContrasenaComun(p), { message: 'Esa contraseña es demasiado común. Elegí otra.' });
