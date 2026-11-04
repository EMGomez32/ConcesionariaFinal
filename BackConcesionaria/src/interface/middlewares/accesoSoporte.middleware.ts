import { Request, Response, NextFunction } from 'express';
import { context } from '../../infrastructure/security/context';
import { audit } from '../../infrastructure/security/audit';
import { recordSecurityEvent } from '../../infrastructure/security/securityEvents';
import { Deduplicador, tenantsEnRespuesta } from '../../infrastructure/security/rastroPrivacidad';

/**
 * ACCESOS DEL PERSONAL DE AUTENZA A LOS DATOS DE UNA CONCESIONARIA (PRIV-13;
 * ISO 27701 B.8.2.2 / B.8.2.6, ISO 27001 A.8.2).
 *
 * El super_admin no tiene tenant: la extensión de Prisma no le recorta nada y lee las
 * fichas, conversaciones y adjuntos de todas las concesionarias. Como encargado del
 * tratamiento, AUTENZA tiene que poder mostrarle a cada concesionaria CUÁNDO su personal
 * miró sus datos. Antes sólo quedaban las escrituras.
 *
 * Cómo: para cada GET de un super_admin se mira la respuesta (no la ruta) y se anotan
 * las concesionarias cuyos datos salieron en ella (`concesionariaId` de las filas). Así
 * el registro dice exactamente a quién se le leyó algo, también en un listado que cruza
 * tenants, y no depende de mantener a mano una lista de rutas "con PII".
 *
 * - Va a la auditoría DEL TENANT afectado (acción `acceso_soporte`), que es lo que el
 *   admin ve en Auditoría → "Accesos de soporte de AUTENZA".
 * - Si la respuesta no trae filas de ningún tenant (un reporte agregado) va a
 *   `security_events`, el rastro de plataforma.
 * - DEDUPLICADO: a lo sumo un registro por (persona de soporte, concesionaria, recurso)
 *   cada `ACCESO_SOPORTE_VENTANA_MIN` minutos (30 por defecto). Navegar una ficha no
 *   puede generar cien filas; "miró clientes de esta concesionaria entre tal y tal hora"
 *   es lo que hay que poder contestar.
 * - Se guarda el path SIN la query: la query puede ser una búsqueda por DNI o teléfono.
 *
 * Quedan afuera las rutas que son la consola de la plataforma (concesionarias, planes y
 * facturación del servicio, roles, el propio rastro de seguridad): no son datos de los
 * clientes de la concesionaria.
 */

const RUTAS_DE_PLATAFORMA = ['/concesionarias', '/billing', '/security-events', '/roles', '/auth', '/health'];

const ventanaMin = (() => {
    const n = Number(process.env.ACCESO_SOPORTE_VENTANA_MIN);
    return Number.isFinite(n) && n >= 1 && n <= 24 * 60 ? n : 30;
})();

const deduplicador = new Deduplicador(ventanaMin * 60_000);

export function accesoSoporte(req: Request, res: Response, next: NextFunction): void {
    const user = context.getUser();
    if (!user?.roles?.includes('super_admin') || req.method !== 'GET') return next();
    if (RUTAS_DE_PLATAFORMA.some((p) => req.path === p || req.path.startsWith(`${p}/`))) return next();

    const ip = context.getIp() ?? null;
    const userAgent = context.getUserAgent() ?? null;
    const recurso = req.path.split('/').filter(Boolean)[0] ?? 'raiz';
    const ruta = `${req.baseUrl}${req.path}`;

    const original = res.json.bind(res);
    res.json = ((body: unknown) => {
        try {
            if (res.statusCode < 400) {
                const tenants = tenantsEnRespuesta(body);
                const porQuery = Number(req.query.concesionariaId);
                if (tenants.size === 0 && Number.isInteger(porQuery) && porQuery > 0) tenants.add(porQuery);

                if (tenants.size === 0) {
                    if (deduplicador.debeRegistrar(`${user.userId}|-|${recurso}`)) {
                        void recordSecurityEvent({
                            accion: 'acceso_soporte',
                            entidad: recurso,
                            usuarioId: user.userId,
                            detalle: `Lectura de soporte sin concesionaria identificable: GET ${ruta}`,
                            ip,
                            userAgent,
                        });
                    }
                }
                for (const concesionariaId of tenants) {
                    if (!deduplicador.debeRegistrar(`${user.userId}|${concesionariaId}|${recurso}`)) continue;
                    void audit({
                        entidad: 'AccesoSoporte',
                        accion: 'acceso_soporte',
                        concesionariaId,
                        usuarioId: user.userId,
                        ip,
                        userAgent,
                        detalle: (
                            `El personal de soporte de AUTENZA (usuario #${user.userId}) consultó datos de "${recurso}" ` +
                            `(GET ${ruta}). Las lecturas siguientes del mismo recurso dentro de ${ventanaMin} min no se repiten.`
                        ).slice(0, 1000),
                    });
                }
            }
        } catch {
            // El rastro nunca rompe la respuesta.
        }
        return original(body);
    }) as Response['json'];

    next();
}
