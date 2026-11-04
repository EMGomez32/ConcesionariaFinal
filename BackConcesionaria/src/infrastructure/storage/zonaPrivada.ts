import path from 'path';
import { firmarRuta } from '../security/urlFirmada';

/**
 * Zona PRIVADA de /uploads: los archivos con datos personales que sólo se sirven con
 * URL firmada y vigente (ver urlFirmada.ts y uploads.middleware.ts).
 *
 *  - Adjuntos de solicitudes de financiación (DNI, recibos de sueldo).
 *  - Documentos de vehículos (títulos, cédulas, boletos, comprobantes): todo archivo de
 *    la ficha del auto que NO es una foto. Las fotos siguen públicas porque las consumen
 *    la SPA, la ficha PDF y Mercado Libre (que las baja de una URL pública).
 *
 * POR QUÉ SE MIRA EL PRIMER SEGMENTO Y NO UN PREFIJO CON BARRA. LocalStorageAdapter sanea
 * el prefijo que le pasan (`solicitudes/42` → `solicitudes-42`), así que el layout REAL en
 * disco es `solicitudes-42/<yyyy-mm>/<hex>.<ext>`. El guarda anterior sólo reconocía
 * `/solicitudes/…`, una ruta que el storage nunca genera: los adjuntos salían por la zona
 * pública, sin firma y cacheables. Se reconocen los dos layouts (con guion y con barra)
 * para cubrir archivos movidos a mano o un storage futuro que respete las barras.
 */

/** Prefijo (pre-saneo) con el que se guardan los adjuntos de una solicitud. */
export const prefijoAdjuntosSolicitud = (solicitudId: number): string => `solicitudes/${solicitudId}`;

/** Prefijo (pre-saneo) con el que se guardan los documentos (no fotos) de un vehículo. */
export const prefijoDocumentosVehiculo = (vehiculoId: number): string => `vehiculos-docs/${vehiculoId}`;

/** Prefijo (pre-saneo) de las fotos del vehículo: zona pública. */
export const prefijoFotosVehiculo = (vehiculoId: number): string => `vehiculos/${vehiculoId}`;

// Primer segmento de la ruta (relativa a /uploads) que marca la zona privada:
// `solicitudes`, `solicitudes-42`, `vehiculos-docs`, `vehiculos-docs-7`. No matchea
// `solicitudesx` ni `vehiculos-7` (fotos).
const SEGMENTO_PRIVADO = /^(solicitudes|vehiculos-docs)(-[^/]*)?$/;

/**
 * Ruta normalizada como la resolvería el filesystem. `express.static` DECODIFICA el path
 * (%73olicitudes → solicitudes) y resuelve `..` y `//`; si el guarda mirara el path CRUDO,
 * `/uploads/%73olicitudes/…` esquivaría el chequeo de prefijo y se serviría sin firma.
 * Devuelve null si el path no se puede decodificar.
 */
export function rutaNormalizada(rawPath: string): string | null {
    try {
        const decodificada = decodeURIComponent(rawPath).replace(/\\/g, '/');
        const n = path.posix.normalize(`/${decodificada}`);
        return n.replace(/\/{2,}/g, '/');
    } catch {
        return null;
    }
}

/**
 * ¿La ruta (ya normalizada, relativa a /uploads) cae en la zona privada? En minúsculas:
 * en un filesystem que no distingue mayúsculas, `/SOLICITUDES-1/x.pdf` abre el mismo archivo.
 */
export function esRutaPrivada(rutaNormalizadaRelativa: string): boolean {
    const primero = rutaNormalizadaRelativa.toLowerCase().split('/').find((s) => s.length > 0) ?? '';
    return SEGMENTO_PRIVADO.test(primero);
}

/** ¿Este storageKey (`solicitudes-42/2026-11/x.pdf`) es de la zona privada? */
export function esStorageKeyPrivado(storageKey: string | null | undefined): boolean {
    if (!storageKey) return false;
    const n = rutaNormalizada(storageKey);
    return n !== null && esRutaPrivada(n);
}

/**
 * La URL que se le entrega al cliente para un archivo guardado. Si es de la zona privada,
 * una URL FIRMADA y con vencimiento armada desde el `storageKey` (lo fija el servidor al
 * subir; la `url` de la fila no se firma nunca: en el alta legacy de vehículos la manda el
 * cliente y firmarla sería emitirle una capacidad sobre cualquier ruta que se le ocurra).
 * Si es pública o un link externo, la url tal cual.
 */
export function urlParaCliente<T extends { url: string; storageKey?: string | null }>(archivo: T): string {
    if (archivo.storageKey && esStorageKeyPrivado(archivo.storageKey)) {
        const n = rutaNormalizada(archivo.storageKey) as string;
        return firmarRuta(`/uploads${n}`);
    }
    return archivo.url;
}

/** Copia del archivo con la `url` lista para el cliente (firmada si es privado). */
export function conUrlParaCliente<T extends { url: string; storageKey?: string | null }>(archivo: T): T {
    return { ...archivo, url: urlParaCliente(archivo) };
}

/**
 * ¿Este archivo de la ficha del vehículo es una FOTO (zona pública)? Todo lo demás
 * (documento, comprobante, plano, otro) va a la zona privada: puede traer nombre, DNI y
 * domicilio del titular, y el único consumidor que necesita una URL pública —Mercado
 * Libre— sólo usa fotos. Sin tipo cuenta como foto: es el criterio que ya usan la web
 * (ComparadorPage) y la app para las filas viejas.
 */
export const esFotoDeVehiculo = (tipo: string | null | undefined): boolean =>
    !tipo || tipo.trim().toLowerCase() === 'foto';
