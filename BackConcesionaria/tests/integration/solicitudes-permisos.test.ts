import { api, loginAsAdmin, login, authHeaders, unique, tryDelete } from './helpers';

/**
 * Mínimo privilegio en la financiación externa (APP-10 / PRIV-03).
 *
 * Una solicitud lleva el cliente entero (DNI, teléfono, domicilio) y su situación
 * crediticia; sus adjuntos, el DNI escaneado y los recibos de sueldo. Antes las tres
 * lecturas no tenían authorize: cualquier rol del tenant las leía, adjuntos incluidos.
 *
 * Contrato:
 *  - Solicitud (listado y detalle): admin, vendedor y lectura. Cobrador y postventa → 403.
 *  - Adjuntos: admin y vendedor. Lectura → 403 (y el detalle le llega sin `archivos`).
 *  - Vendedor "puro": el listado y los adjuntos se recortan a los clientes de SU cartera.
 */
describe('Financiación externa: quién lee solicitudes y adjuntos', () => {
    let adminTok: string;
    const tok: Record<string, string> = {};
    const ids: Record<string, number> = {};
    const creados: number[] = [];
    let solicitudId: number;

    const crearUsuario = async (clave: string, rol: string) => {
        const roles = await api.get('/api/roles', authHeaders(adminTok));
        const lista: any[] = roles.data.results ?? roles.data;
        const rolId = lista.find((r) => r.nombre === rol)?.id;
        expect(rolId).toBeTruthy();
        const email = `${unique(clave)}@demo.com`;
        const pass = 'secret12345';
        const res = await api.post('/api/usuarios', { nombre: unique(clave), email, password: pass, roleIds: [rolId] }, authHeaders(adminTok));
        expect(res.status).toBe(201);
        creados.push(res.data.id);
        ids[clave] = res.data.id;
        tok[clave] = (await login(email, pass)).token;
    };

    beforeAll(async () => {
        adminTok = (await loginAsAdmin()).token;
        await crearUsuario('vendA', 'vendedor');
        await crearUsuario('vendB', 'vendedor');
        await crearUsuario('cobrador', 'cobrador');
        await crearUsuario('postventa', 'postventa');
        await crearUsuario('lectura', 'lectura');

        // Cliente de la cartera del vendedor A (asignación reciente: no vence la retención).
        const cli = await api.post('/api/clientes', { nombre: unique('CliCartera'), vendedorAsignadoId: ids.vendA }, authHeaders(adminTok));
        expect(cli.status).toBe(201);
        const fin = await api.post('/api/financieras', { nombre: unique('BancoPerm'), tipo: 'banco' }, authHeaders(adminTok));
        expect(fin.status).toBe(201);
        const sol = await api.post('/api/financiacion-solicitudes', { clienteId: cli.data.id, financieraId: fin.data.id }, authHeaders(adminTok));
        expect(sol.status).toBe(201);
        solicitudId = sol.data.id;

        const PDF = Buffer.concat([Buffer.from('%PDF-1.7\nRECIBO\n', 'latin1'), Buffer.alloc(64, 0x20)]);
        const fd = new FormData();
        fd.append('file', new Blob([new Uint8Array(PDF)], { type: 'application/pdf' }), 'recibo.pdf');
        const up = await api.post(`/api/financiacion-solicitudes/${solicitudId}/archivos/upload`, fd, {
            headers: { Authorization: `Bearer ${adminTok}`, 'Content-Type': 'multipart/form-data' },
        });
        expect(up.status).toBe(201);
    });

    afterAll(async () => {
        for (const id of creados) await tryDelete(`/api/usuarios/${id}`, adminTok);
    });

    const listado = (t: string) => api.get('/api/financiacion-solicitudes?limit=100', authHeaders(t));
    const idsDe = (r: any): number[] => (r.data.results ?? []).map((s: { id: number }) => s.id);

    test.each(['cobrador', 'postventa'])('%s no lee solicitudes ni adjuntos (403)', async (rol) => {
        expect((await listado(tok[rol])).status).toBe(403);
        expect((await api.get(`/api/financiacion-solicitudes/${solicitudId}`, authHeaders(tok[rol]))).status).toBe(403);
        expect((await api.get(`/api/financiacion-solicitudes/${solicitudId}/archivos`, authHeaders(tok[rol]))).status).toBe(403);
    });

    test('lectura ve la solicitud pero NO los papeles', async () => {
        const l = await listado(tok.lectura);
        expect(l.status).toBe(200);
        expect(idsDe(l)).toContain(solicitudId);

        const det = await api.get(`/api/financiacion-solicitudes/${solicitudId}`, authHeaders(tok.lectura));
        expect(det.status).toBe(200);
        expect(det.data.archivos).toBeUndefined();

        expect((await api.get(`/api/financiacion-solicitudes/${solicitudId}/archivos`, authHeaders(tok.lectura))).status).toBe(403);
    });

    test('el vendedor del cliente ve la solicitud y sus adjuntos (URL firmada)', async () => {
        expect(idsDe(await listado(tok.vendA))).toContain(solicitudId);
        const adj = await api.get(`/api/financiacion-solicitudes/${solicitudId}/archivos`, authHeaders(tok.vendA));
        expect(adj.status).toBe(200);
        expect(adj.data).toHaveLength(1);
        expect(adj.data[0].url).toMatch(/\?exp=\d+&sig=[0-9a-f]{64}$/);
    });

    test('OTRO vendedor: la solicitud no aparece en su listado y los papeles le dan 403', async () => {
        const l = await listado(tok.vendB);
        expect(l.status).toBe(200);
        expect(idsDe(l)).not.toContain(solicitudId);
        expect((await api.get(`/api/financiacion-solicitudes/${solicitudId}/archivos`, authHeaders(tok.vendB))).status).toBe(403);
        // La ficha puntual sigue abierta (mismo criterio que la del cliente), pero sin adjuntos.
        const det = await api.get(`/api/financiacion-solicitudes/${solicitudId}`, authHeaders(tok.vendB));
        expect(det.status).toBe(200);
        expect(det.data.archivos).toBeUndefined();
    });

    test('el admin ve todo', async () => {
        expect(idsDe(await listado(adminTok))).toContain(solicitudId);
        const det = await api.get(`/api/financiacion-solicitudes/${solicitudId}`, authHeaders(adminTok));
        expect(det.status).toBe(200);
        expect(det.data.archivos).toHaveLength(1);
        expect((await api.get(`/api/financiacion-solicitudes/${solicitudId}/archivos`, authHeaders(adminTok))).status).toBe(200);
    });
});
