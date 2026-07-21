import { Response } from 'express';

export type Col = { key: string; header: string };

/**
 * Escapa un valor para CSV: estructura (comillas, comas, saltos) e inyección de
 * fórmulas.
 *
 * Excel y LibreOffice interpretan como FÓRMULA cualquier celda que arranque con
 * = + - @ (o tab / CR). Como estos export exponen texto cargado por el usuario
 * (nombre de cliente, descripción, user-agent), alcanza con llamar a alguien
 * `=HYPERLINK(...)` para que la celda se ejecute al abrir el archivo. El
 * entrecomillado NO protege de esto: Excel evalúa igual. Se antepone un
 * apóstrofo, que fuerza a leer la celda como texto.
 *
 * Los NÚMEROS quedan afuera de esa defensa a propósito: un negativo (-500, un
 * neto en rojo) empieza con '-' y prefijarlo lo convertiría en texto, rompiendo
 * las sumas en la planilla.
 */
export function csvEscape(v: unknown): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(v);

    let s = String(v);
    // Sólo si NO es un número escrito como texto: "-500" tiene que seguir siendo número.
    const esNumero = /^-?\d+(\.\d+)?$/.test(s.trim());
    if (!esNumero && /^[=+\-@\t\r]/.test(s)) {
        s = `'${s}`;
    }
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Envía `rows` como CSV descargable (con BOM para que Excel lea UTF-8). */
export function sendCsv(res: Response, filenameBase: string, cols: Col[], rows: Record<string, unknown>[]) {
    const header = cols.map((c) => csvEscape(c.header)).join(',');
    const body = rows.map((r) => cols.map((c) => csvEscape(r[c.key])).join(',')).join('\n');
    const csv = [header, body].filter(Boolean).join('\n');
    const filename = `${filenameBase}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + csv);
}
