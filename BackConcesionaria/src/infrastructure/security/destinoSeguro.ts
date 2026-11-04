import dns from 'dns';
import net from 'net';

/**
 * Anti-SSRF para destinos que elige un USUARIO (hoy: el host IMAP que un admin de
 * concesionaria carga en Integraciones y al que el backend se conecta solo, cada 5 min).
 *
 * Sin esto, un admin podía apuntar el host a `db`, `backend`, `169.254.169.254`, la LAN
 * de la Raspberry o la interfaz Tailscale, escanear puertos internos y leer el resultado
 * en `ultimoError`. Acá se rechaza todo destino que no sea Internet público.
 *
 * Dos capas, porque la validación al guardar NO alcanza (el DNS puede cambiar después,
 * "DNS rebinding"): 1) al guardar, `validarHostSintaxis` + `resolverDestinoPublico`;
 * 2) al CONECTAR, se vuelve a resolver y se conecta a la IP ya validada, no al nombre.
 */

export class DestinoNoPermitidoError extends Error {
    constructor(mensaje: string) {
        super(mensaje);
        this.name = 'DestinoNoPermitidoError';
    }
}

// Rangos que NO son Internet público. BlockList resuelve además las direcciones IPv4
// mapeadas a IPv6 (::ffff:10.0.0.1) contra las reglas IPv4.
const bloqueadas = new net.BlockList();
const v4: Array<[string, number]> = [
    ['0.0.0.0', 8],        // "esta red"
    ['10.0.0.0', 8],       // privada
    ['100.64.0.0', 10],    // CGNAT (incluye Tailscale)
    ['127.0.0.0', 8],      // loopback
    ['169.254.0.0', 16],   // link-local (metadatos de nube: 169.254.169.254)
    ['172.16.0.0', 12],    // privada (redes de Docker)
    ['192.0.0.0', 24],     // reservada IETF
    ['192.0.2.0', 24],     // documentación
    ['192.168.0.0', 16],   // privada (LAN)
    ['198.18.0.0', 15],    // benchmarking
    ['198.51.100.0', 24],  // documentación
    ['203.0.113.0', 24],   // documentación
    ['224.0.0.0', 4],      // multicast
    ['240.0.0.0', 4],      // reservada + broadcast
];
for (const [red, prefijo] of v4) bloqueadas.addSubnet(red, prefijo, 'ipv4');
const v6: Array<[string, number]> = [
    ['::', 128],           // no especificada
    ['::1', 128],          // loopback
    ['fc00::', 7],         // ULA (privada)
    ['fe80::', 10],        // link-local
    ['ff00::', 8],         // multicast
    ['2001:db8::', 32],    // documentación
    ['100::', 64],         // descarte
    ['64:ff9b::', 96],     // NAT64: podría apuntar a una IPv4 privada
    ['2002::', 16],        // 6to4: idem
];
for (const [red, prefijo] of v6) bloqueadas.addSubnet(red, prefijo, 'ipv6');

/** ¿La IP (v4 o v6) pertenece a un rango no público? Una cadena que no es IP también cuenta. */
export function esIpNoPublica(ip: string): boolean {
    const familia = net.isIP(ip);
    if (familia === 0) return true;
    return bloqueadas.check(ip, familia === 4 ? 'ipv4' : 'ipv6');
}

// Sufijos que sólo existen en redes internas.
const SUFIJOS_INTERNOS = ['.local', '.localhost', '.internal', '.lan', '.home', '.home.arpa', '.corp', '.intranet', '.docker'];

/**
 * Chequeo SIN red del host: forma y nombres que claramente son internos. Sirve para
 * validar al vuelo (Zod) y como primer filtro. No reemplaza a `resolverDestinoPublico`.
 */
export function validarHostSintaxis(hostCrudo: string): string {
    const host = String(hostCrudo ?? '').trim().toLowerCase().replace(/\.$/, '');
    if (!host) throw new DestinoNoPermitidoError('El host es obligatorio');
    if (host.length > 253) throw new DestinoNoPermitidoError('El host es demasiado largo');
    if (/\s|\/|\\|@|\?|#|%/.test(host)) throw new DestinoNoPermitidoError('El host tiene caracteres no válidos');

    if (net.isIP(host)) {
        if (esIpNoPublica(host)) throw new DestinoNoPermitidoError('El host apunta a una dirección interna o reservada');
        return host;
    }
    // Sólo nombres DNS normales. Rechaza notaciones raras de IP (0x7f.1, 2130706433, 017700000001),
    // que algunas librerías interpretan como IP aunque net.isIP diga 0.
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
        throw new DestinoNoPermitidoError('Ingresá un nombre de servidor válido (por ejemplo imap.gmail.com)');
    }
    // Un TLD numérico ("1.2.3.4.5", "10.1") no es un nombre: es una IP mal escrita.
    if (/^\d+$/.test(host.split('.').pop() ?? '')) {
        throw new DestinoNoPermitidoError('Ingresá un nombre de servidor válido (por ejemplo imap.gmail.com)');
    }
    if (SUFIJOS_INTERNOS.some((s) => host.endsWith(s))) {
        throw new DestinoNoPermitidoError('El host apunta a una red interna');
    }
    return host;
}

export interface DestinoResuelto {
    /** IP ya validada: es a la que hay que CONECTARSE (no volver a resolver el nombre). */
    ip: string;
    familia: 4 | 6;
    /** Nombre original, para SNI / validación del certificado TLS. */
    host: string;
}

const TIMEOUT_DNS_MS = 5000;

/** Resuelve el host y exige que TODAS sus direcciones sean públicas (una mezcla se rechaza). */
export async function resolverDestinoPublico(hostCrudo: string): Promise<DestinoResuelto> {
    const host = validarHostSintaxis(hostCrudo);

    if (net.isIP(host)) {
        return { ip: host, familia: net.isIP(host) as 4 | 6, host };
    }

    let direcciones: dns.LookupAddress[];
    try {
        direcciones = await Promise.race([
            dns.promises.lookup(host, { all: true, verbatim: true }),
            new Promise<never>((_, rechazar) =>
                setTimeout(() => rechazar(new Error('timeout')), TIMEOUT_DNS_MS).unref(),
            ),
        ]);
    } catch {
        throw new DestinoNoPermitidoError('No se pudo resolver el servidor indicado');
    }
    if (!direcciones.length) throw new DestinoNoPermitidoError('No se pudo resolver el servidor indicado');

    // TODAS deben ser públicas: si el nombre devuelve una pública y una interna, se rechaza
    // (el cliente podría terminar conectándose a la interna).
    if (direcciones.some((d) => esIpNoPublica(d.address))) {
        throw new DestinoNoPermitidoError('El host apunta a una dirección interna o reservada');
    }
    // Se prefiere IPv4 si hay (más compatible con hosting común).
    const elegida = direcciones.find((d) => d.family === 4) ?? direcciones[0];
    return { ip: elegida.address, familia: elegida.family as 4 | 6, host };
}

/** Puertos IMAP legítimos. Otros convertirían al backend en un escáner de puertos ajenos. */
export const PUERTOS_IMAP_PERMITIDOS: readonly number[] = [143, 993];

export function validarPuertoImap(puerto: number): void {
    if (!PUERTOS_IMAP_PERMITIDOS.includes(puerto)) {
        throw new DestinoNoPermitidoError(`Puerto no permitido. Usá ${PUERTOS_IMAP_PERMITIDOS.join(' o ')}`);
    }
}

/**
 * Las llamadas autenticadas a APIs de terceros (Meta, Mercado Libre) mandan el token del
 * cliente en `Authorization`. Si la ruta llegara como URL absoluta (p. ej. un cursor de
 * paginación que vino de la base o de un tercero), el token viajaría al host que diga esa
 * URL. Se exige el MISMO origen que la API base.
 */
export function assertMismoOrigen(url: URL, base: string): void {
    if (url.origin !== new URL(base).origin) {
        throw new DestinoNoPermitidoError(`Destino no permitido: ${url.origin}`);
    }
}
