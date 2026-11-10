import bcrypt from 'bcryptjs';

/**
 * Hash de contraseñas (APP-13).
 *
 * Costo de bcrypt: 12 en producción. Medido en la Pi de producción (nov-2026, bcryptjs,
 * arm64): costo 10 ≈ 110 ms, 11 ≈ 220 ms, 12 ≈ 460 ms por hash o por verificación. Cada
 * punto duplica lo que cuesta crackear un volcado de la base offline; 12 es lo usual hoy y
 * medio segundo en el login es aceptable. Se puede bajar o subir con BCRYPT_COST (10 a 14)
 * sin tocar código, por ejemplo al mudar producción a un servidor más rápido.
 *
 * Fuera de producción el default es 10, para que la suite de integración (cientos de
 * logins) no tarde cuatro veces más.
 *
 * Sin imports de config/logger a propósito: env.ts hace process.exit(1) al importarse sin
 * .env, y esto lo usan use-cases que corren en los tests unitarios.
 */
const COSTO_MINIMO = 10;
const COSTO_MAXIMO = 14;

export function costoBcrypt(): number {
    const pedido = Number(process.env.BCRYPT_COST);
    if (Number.isInteger(pedido) && pedido >= COSTO_MINIMO && pedido <= COSTO_MAXIMO) return pedido;
    return process.env.NODE_ENV === 'production' ? 12 : 10;
}

export const hashearContrasena = (plano: string): Promise<string> => bcrypt.hash(plano, costoBcrypt());

/**
 * ¿El hash guardado es más barato que el costo actual? Los hashes viejos (costo 10) se
 * re-hashean solos en el próximo login exitoso, que es el único momento en que el servidor
 * tiene la contraseña en claro.
 */
export function necesitaRehash(hash: string): boolean {
    try {
        return bcrypt.getRounds(hash) < costoBcrypt();
    } catch {
        return false; // no es un hash de bcrypt reconocible: no se toca
    }
}
