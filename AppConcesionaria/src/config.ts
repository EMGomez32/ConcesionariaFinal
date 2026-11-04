/**
 * Configuración de entorno de la app.
 *
 * Por defecto apunta al backend de PRODUCCIÓN (el mismo que usa la web). Se puede
 * sobreescribir con la variable `EXPO_PUBLIC_API_BASE_URL` (Expo expone al bundle
 * las env que empiezan con EXPO_PUBLIC_) — útil para apuntar a un backend local
 * en desarrollo.
 *
 * Notas de desarrollo:
 *  - Emulador Android: `localhost` del host es `10.0.2.2`.
 *  - Dispositivo real con Expo Go: usá la IP de tu PC en la LAN
 *    (ej. http://192.168.0.x:3000/api).
 *  - En dispositivo NATIVO no hay CORS; sólo el target web del navegador lo aplica.
 */
import { origenDe } from './lib/urls';

export const API_BASE_URL =
    process.env.EXPO_PUBLIC_API_BASE_URL || 'https://autenza.nebulant.com.ar/api';

/**
 * La versión web (para "¿Olvidaste tu contraseña?" y los roles sin app). Por
 * defecto, el mismo origen que la API; `EXPO_PUBLIC_WEB_BASE_URL` la cambia (en
 * desarrollo la web suele correr en otro puerto que el backend).
 */
export const WEB_BASE_URL = process.env.EXPO_PUBLIC_WEB_BASE_URL || origenDe(API_BASE_URL);
