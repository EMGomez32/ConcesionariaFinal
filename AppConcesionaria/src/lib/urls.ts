/**
 * URLs derivadas del backend. Funciones puras (se prueban desde node).
 */

/** Origen (esquema + host + puerto) de una URL: "https://x.com.ar/api" → "https://x.com.ar". */
export const origenDe = (url: string): string => {
    const m = /^(https?:\/\/[^/?#]+)/i.exec(url.trim());
    return m ? m[1] : '';
};

/**
 * URL absoluta de un archivo subido (foto de una unidad). El backend guarda la
 * ruta relativa a SU origen ("/uploads/vehiculos/12/2026-10/abc.jpg", servida como
 * estática y sin firma); los archivos legacy pueden traer una URL externa
 * absoluta, que se respeta tal cual.
 */
export const urlArchivo = (url: string | null | undefined, apiBase: string): string | null => {
    const u = (url ?? '').trim();
    if (!u) return null;
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return `https:${u}`;
    const origen = origenDe(apiBase);
    if (!origen) return null;
    return `${origen}${u.startsWith('/') ? '' : '/'}${u}`;
};
