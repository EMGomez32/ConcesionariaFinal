import { esContrasenaComun } from '../src/interface/validation/password';

/**
 * Contraseña de las cuentas que crea seed-demo.ts.
 *
 * El default (`demo1234`) está publicado en el repo, que es público: sirve para una demo
 * local, nunca para una base accesible desde internet. En producción (la única forma de
 * correr el seed ahí es con SEED_DEMO_FORCE=true) se exige SEED_DEMO_PASSWORD y que cumpla
 * la misma política que las contraseñas nuevas de la app: 10+ caracteres, máximo 72 bytes
 * y fuera de la lista de comunes.
 */
export const PASSWORD_DEMO_POR_DEFECTO = 'demo1234';

export function resolverPasswordDemo(nodeEnv: string | undefined, valor: string | undefined): string {
    const password = valor && valor.length > 0 ? valor : PASSWORD_DEMO_POR_DEFECTO;
    if (nodeEnv !== 'production') return password;

    if (password === PASSWORD_DEMO_POR_DEFECTO) {
        throw new Error('En producción definí SEED_DEMO_PASSWORD: la contraseña demo por defecto está publicada en el repositorio.');
    }
    if (password.length < 10 || Buffer.byteLength(password, 'utf8') > 72 || esContrasenaComun(password)) {
        throw new Error('SEED_DEMO_PASSWORD es débil: tiene que tener al menos 10 caracteres (máximo 72 bytes) y no ser una contraseña común.');
    }
    return password;
}
