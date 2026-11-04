/**
 * Texto apto para UNA línea de log: sin CR/LF, para que un valor que viene de afuera
 * (un request, el payload de un webhook de Meta o de Mercado Libre, el mensaje de un
 * error remoto) no pueda fabricar líneas de log falsas (CWE-117).
 *
 * En producción el logger escribe JSON y ya escapa los saltos de línea; en desarrollo
 * usa texto plano y no. Se sanea igual en los dos para no depender del formato.
 *
 * Sin imports a propósito: lo usan todas las capas (rutas, servicios, integraciones),
 * y un import de config/logger acá haría `process.exit(1)` en los tests sin .env.
 */
export const textoParaLog = (texto: string): string => texto.replace(/\n|\r/g, '');
