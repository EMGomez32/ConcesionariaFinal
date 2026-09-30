// Unit tests PUROS (DNS mockeado): anti-SSRF del host IMAP y de las APIs de terceros.
const lookup = jest.fn();
jest.mock('dns', () => {
    const promises = { lookup: (...args: unknown[]) => lookup(...args) };
    return { __esModule: true, default: { promises }, promises };
});

import {
    assertMismoOrigen,
    esIpNoPublica,
    resolverDestinoPublico,
    validarHostSintaxis,
    validarPuertoImap,
} from '../../src/infrastructure/security/destinoSeguro';
import { emailConfigSchema, updateEmailConfigSchema } from '../../src/interface/validation/integracion.schema';

describe('esIpNoPublica', () => {
    test.each([
        '127.0.0.1', '127.255.255.254', '10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.255',
        '192.168.0.1', '192.168.255.255', '169.254.169.254', '100.64.0.1', '100.127.255.255', '0.0.0.0',
        '255.255.255.255', '224.0.0.1', '198.18.0.1',
        '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1',
        '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:192.168.1.1', '::ffff:169.254.169.254',
        '64:ff9b::7f00:1',
    ])('%s es NO pública', (ip) => {
        expect(esIpNoPublica(ip)).toBe(true);
    });

    test.each([
        '8.8.8.8', '1.1.1.1', '172.32.0.1', '172.15.255.255', '100.128.0.1', '11.0.0.1', '192.169.0.1',
        '2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8',
    ])('%s es pública', (ip) => {
        expect(esIpNoPublica(ip)).toBe(false);
    });

    test('lo que no es una IP se trata como no público (falla cerrado)', () => {
        expect(esIpNoPublica('no-es-ip')).toBe(true);
        expect(esIpNoPublica('')).toBe(true);
    });
});

describe('validarHostSintaxis', () => {
    test('acepta un servidor IMAP real y lo normaliza', () => {
        expect(validarHostSintaxis('imap.gmail.com')).toBe('imap.gmail.com');
        expect(validarHostSintaxis('  IMAP.Gmail.COM. ')).toBe('imap.gmail.com');
        expect(validarHostSintaxis('outlook.office365.com')).toBe('outlook.office365.com');
        expect(validarHostSintaxis('mail-1.ejemplo.com.ar')).toBe('mail-1.ejemplo.com.ar');
    });

    test('acepta una IP pública literal', () => {
        expect(validarHostSintaxis('8.8.8.8')).toBe('8.8.8.8');
    });

    test.each([
        ['vacío', ''],
        ['localhost', 'localhost'],
        ['servicio de docker: db', 'db'],
        ['servicio de docker: backend', 'backend'],
        ['servicio de docker: prisma-studio', 'prisma-studio'],
        ['sufijo .internal', 'metadata.google.internal'],
        ['sufijo .local', 'impresora.local'],
        ['sufijo .localhost', 'app.localhost'],
        ['sufijo .lan', 'nas.lan'],
        ['loopback', '127.0.0.1'],
        ['metadatos de nube', '169.254.169.254'],
        ['LAN', '192.168.0.10'],
        ['Tailscale', '100.64.0.5'],
        ['IPv6 loopback', '::1'],
        ['IPv4 mapeada', '::ffff:10.0.0.1'],
        ['IP en decimal', '2130706433'],
        ['IP en hexa', '0x7f.1'],
        ['IP en octal', '017700000001'],
        ['IP incompleta', '10.1'],
        ['5 octetos', '1.2.3.4.5'],
        ['con puerto', 'imap.gmail.com:993'],
        ['con ruta', 'imap.gmail.com/x'],
        ['con credenciales', 'user@evil.com'],
        ['con espacios', 'a b.com'],
        ['con fragmento', 'evil.com#'],
        ['entre corchetes', '[::1]'],
        ['demasiado largo', `${'a'.repeat(250)}.com`],
    ])('rechaza %s (%s)', (_desc, host) => {
        expect(() => validarHostSintaxis(host)).toThrow(/host|nombre|interna|dirección|servidor/i);
    });
});

describe('resolverDestinoPublico', () => {
    beforeEach(() => lookup.mockReset());

    test('nombre que resuelve a IP pública: devuelve la IP a la que HAY que conectarse', async () => {
        lookup.mockResolvedValue([{ address: '64.233.184.109', family: 4 }]);
        expect(await resolverDestinoPublico('imap.gmail.com')).toEqual({
            ip: '64.233.184.109', familia: 4, host: 'imap.gmail.com',
        });
    });

    test('prefiere IPv4 cuando hay ambas', async () => {
        lookup.mockResolvedValue([
            { address: '2a00:1450:4013:c00::6d', family: 6 }, { address: '64.233.184.109', family: 4 },
        ]);
        expect((await resolverDestinoPublico('imap.gmail.com')).ip).toBe('64.233.184.109');
    });

    test('un nombre que resuelve a una IP INTERNA se rechaza (DNS que apunta adentro)', async () => {
        lookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
        await expect(resolverDestinoPublico('interno.ejemplo.com')).rejects.toThrow(/interna/);
    });

    test('respuesta MIXTA (una pública y una interna) se rechaza', async () => {
        lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]);
        await expect(resolverDestinoPublico('mixto.ejemplo.com')).rejects.toThrow(/interna/);
    });

    test('resuelve a IPv6 interna (ULA) → rechazado', async () => {
        lookup.mockResolvedValue([{ address: 'fd00::1', family: 6 }]);
        await expect(resolverDestinoPublico('v6.ejemplo.com')).rejects.toThrow(/interna/);
    });

    test('dominio que no resuelve → error genérico (no filtra el motivo del DNS)', async () => {
        lookup.mockRejectedValue(Object.assign(new Error('getaddrinfo ENOTFOUND x'), { code: 'ENOTFOUND' }));
        await expect(resolverDestinoPublico('no-existe.ejemplo.com')).rejects.toThrow('No se pudo resolver el servidor indicado');
    });

    test('respuesta vacía → rechazado', async () => {
        lookup.mockResolvedValue([]);
        await expect(resolverDestinoPublico('vacio.ejemplo.com')).rejects.toThrow(/resolver/);
    });

    test('IP pública literal: no consulta DNS', async () => {
        expect((await resolverDestinoPublico('8.8.8.8')).ip).toBe('8.8.8.8');
        expect(lookup).not.toHaveBeenCalled();
    });

    test('IP interna literal o nombre interno: se rechaza SIN consultar DNS', async () => {
        for (const h of ['127.0.0.1', 'db', 'metadata.google.internal', '169.254.169.254']) {
            await expect(resolverDestinoPublico(h)).rejects.toBeDefined();
        }
        expect(lookup).not.toHaveBeenCalled();
    });
});

describe('validarPuertoImap', () => {
    test.each([143, 993])('puerto %i permitido', (p) => {
        expect(() => validarPuertoImap(p)).not.toThrow();
    });

    test.each([22, 25, 80, 443, 3000, 5432, 5555, 6379, 27017, 9200])('puerto %i rechazado (no es IMAP)', (p) => {
        expect(() => validarPuertoImap(p)).toThrow(/Puerto no permitido/);
    });
});

describe('assertMismoOrigen (el token de Meta/ML no viaja a otro host)', () => {
    const GRAPH = 'https://graph.facebook.com/v21.0';

    test('el mismo origen pasa, con cualquier ruta o query', () => {
        expect(() => assertMismoOrigen(new URL('https://graph.facebook.com/v21.0/me?fields=id'), GRAPH)).not.toThrow();
        expect(() => assertMismoOrigen(new URL('https://graph.facebook.com/v22.0/paging?after=x'), GRAPH)).not.toThrow();
    });

    test.each([
        'https://evil.com/v21.0/me',
        'http://graph.facebook.com/v21.0/me',
        'https://graph.facebook.com.evil.com/v21.0/me',
        'https://graph.facebook.com@evil.com/v21.0/me',
        'https://graph.facebook.com:8443/v21.0/me',
        'https://169.254.169.254/latest/meta-data',
    ])('%s se rechaza', (url) => {
        expect(() => assertMismoOrigen(new URL(url), GRAPH)).toThrow(/Destino no permitido/);
    });
});

describe('schemas de integración (host y puerto IMAP)', () => {
    const base = { origen: 'deruedas', host: 'imap.gmail.com', port: 993, secure: true, user: 'u@x.com', pass: 'p', carpeta: 'INBOX' };

    test('una casilla real es válida', () => {
        expect(emailConfigSchema.safeParse(base).success).toBe(true);
    });

    test('el puerto por defecto (993) sigue funcionando', () => {
        const { port: _p, ...sinPuerto } = base;
        expect((emailConfigSchema.parse(sinPuerto) as any).port).toBe(993);
    });

    test.each(['db', 'backend', '127.0.0.1', '169.254.169.254', 'metadata.google.internal', '10.0.0.5'])(
        'host %s se rechaza al crear', (host) => {
            expect(emailConfigSchema.safeParse({ ...base, host }).success).toBe(false);
        });

    test.each([22, 5432, 6379, 3000])('puerto %i se rechaza al crear', (port) => {
        expect(emailConfigSchema.safeParse({ ...base, port }).success).toBe(false);
    });

    test('el PATCH parcial también valida host y puerto', () => {
        expect(updateEmailConfigSchema.safeParse({ host: 'db' }).success).toBe(false);
        expect(updateEmailConfigSchema.safeParse({ port: 5432 }).success).toBe(false);
        expect(updateEmailConfigSchema.safeParse({ host: 'imap.gmail.com', port: 143 }).success).toBe(true);
        // Sin host ni puerto (sólo cambia la carpeta): no exige nada.
        expect(updateEmailConfigSchema.safeParse({ carpeta: 'Consultas' }).success).toBe(true);
    });
});
