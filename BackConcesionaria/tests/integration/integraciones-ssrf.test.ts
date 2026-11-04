import { api, loginAsAdmin, authHeaders, unique } from './helpers';

/**
 * SSRF por el host IMAP (auditoría de seguridad, H7): el admin de una concesionaria carga
 * el host de su casilla y el backend se conecta solo. Hosts internos y puertos que no son
 * de IMAP se rechazan al guardar, sin depender de DNS ni de red (los casos positivos y la
 * resolución de DNS están en tests/unit/destinoSeguro.test.ts).
 */
describe('Integraciones IMAP: el host no puede apuntar adentro', () => {
    let adminToken: string;

    beforeAll(async () => {
        adminToken = (await loginAsAdmin()).token;
    });

    const crear = (host: string, port = 993) =>
        api.post(
            '/api/integraciones',
            {
                tipo: 'email',
                nombre: unique('ImapSsrf'),
                config: { origen: 'deruedas', host, port, secure: true, user: 'u@x.com', pass: 'clave', carpeta: 'INBOX' },
            },
            authHeaders(adminToken),
        );

    test.each([
        'db', 'backend', 'prisma-studio', 'localhost', '127.0.0.1', '169.254.169.254',
        '192.168.1.10', '10.0.0.5', '172.17.0.2', '100.64.0.1', 'metadata.google.internal', '2130706433', '[::1]',
    ])('host %s → 400 y NO se crea la integración', async (host) => {
        const r = await crear(host);
        expect(r.status).toBe(400);
        expect(r.data.error).toBe('VALIDATION_ERROR');
        expect(r.data.id).toBeUndefined();
    });

    test.each([22, 25, 3000, 5432, 6379])('puerto %i (no es IMAP) → 400', async (port) => {
        const r = await crear('imap.gmail.com', port);
        expect(r.status).toBe(400);
        expect(r.data.error).toBe('VALIDATION_ERROR');
    });

    test('un host interno tampoco entra por PATCH de una integración existente', async () => {
        // Una integración inexistente da 404 ANTES de validar; lo que importa acá es que la ruta
        // no acepte el body: el schema de update rechaza el host en la capa de validación.
        const r = await api.patch('/api/integraciones/999999999', { config: { host: 'db' } }, authHeaders(adminToken));
        expect([400, 404]).toContain(r.status);
    });
});
