import { Request, Response, NextFunction } from 'express';
import { context } from '../../infrastructure/security/context';
import { audit } from '../../infrastructure/security/audit';
import { describirFiltros, exportConDatosPersonales } from '../../infrastructure/security/rastroPrivacidad';

/**
 * RASTRO DE EXPORTACIONES MASIVAS (PRIV-10; ISO 27001 A.8.12 / A.8.15).
 *
 * Cada CSV que sale del sistema deja una fila en la auditoría del tenant: quién, qué
 * archivo, con qué filtros (los que pueden ser datos personales, enmascarados) y cuántas
 * filas. Es el control contra el riesgo interno típico del rubro: un vendedor que se
 * lleva la cartera a la competencia. Antes el CSV de clientes (DNI, teléfono, email,
 * domicilio de hasta 5000 personas) no dejaba ninguna huella.
 *
 * Por qué un middleware y no una línea en cada controller: todos los CSV salen por
 * `utils/csv.sendCsv`, que marca la respuesta (`Content-Type: text/csv` y el header
 * `X-Export-Filas`). Mirar la respuesta acá cubre los diez exports de hoy y el que se
 * agregue mañana, sin que nadie tenga que acordarse de auditarlo.
 *
 * Se registra al TERMINAR la respuesta y sólo si salió bien (2xx). El usuario y la IP se
 * capturan al entrar: el evento `finish` no corre dentro del contexto del request.
 */
export function auditoriaExport(req: Request, res: Response, next: NextFunction): void {
    const user = context.getUser();
    const ip = context.getIp() ?? null;
    const userAgent = context.getUserAgent() ?? null;
    const query = { ...(req.query as Record<string, unknown>) };
    const ruta = `${req.method} ${req.baseUrl}${req.path}`;

    res.on('finish', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return;
        const tipo = String(res.getHeader('Content-Type') ?? '');
        if (!tipo.startsWith('text/csv')) return;

        const disposicion = String(res.getHeader('Content-Disposition') ?? '');
        const archivo = /filename="([^"]+)"/.exec(disposicion)?.[1] ?? 'export.csv';
        const filas = Number(res.getHeader('X-Export-Filas'));
        const truncado = res.getHeader('X-Export-Truncated');
        const pii = exportConDatosPersonales(archivo);

        void audit({
            entidad: 'Exportacion',
            accion: 'export',
            concesionariaId: user?.concesionariaId ?? null,
            usuarioId: user?.userId ?? null,
            ip,
            userAgent,
            detalle: (
                `CSV "${archivo}"${pii ? ' (con datos personales)' : ''}: ` +
                `${Number.isFinite(filas) ? filas : '?'} fila(s)` +
                (truncado ? ` (recortado; había ${truncado})` : '') +
                `; filtros: ${describirFiltros(query)}; ${ruta}`
            ).slice(0, 1000),
        });
    });
    next();
}
