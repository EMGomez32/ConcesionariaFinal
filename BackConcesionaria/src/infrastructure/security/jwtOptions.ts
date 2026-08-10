import type { Algorithm } from 'jsonwebtoken';

/**
 * Algoritmo de firma/verificación de los JWT. Se pinnea a un único algoritmo
 * simétrico (HS256) y se pasa SIEMPRE — tanto al firmar (`algorithm`) como al
 * verificar (`algorithms`) — para cerrar la clase de ataques de confusión de
 * algoritmo: un atacante que manipula el header del token (`alg: none` para
 * saltear la firma, o `RS256→HS256` para abusar de una clave pública como
 * secreto HMAC) no puede forzar al verificador a aceptar otro algoritmo.
 *
 * Firma y verificación DEBEN leer de acá para no divergir nunca.
 */
export const JWT_ALGORITHM: Algorithm = 'HS256';

/** Lista blanca de algoritmos aceptados al verificar (`jwt.verify`). */
export const JWT_ALGORITHMS: Algorithm[] = [JWT_ALGORITHM];
