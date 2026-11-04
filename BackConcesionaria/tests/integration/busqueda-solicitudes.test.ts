import { api, loginAsAdmin, authHeaders, unique } from './helpers';

/**
 * Búsqueda en el servidor (`?q=`) de las solicitudes de financiación externa. La
 * pantalla filtraba en memoria la página cargada ("Buscar en esta página"): lo que
 * estaba en la página 2 no aparecía. Busca por cliente, unidad y financiera.
 */
describe('Búsqueda q en solicitudes de financiación externa', () => {
    let adToken: string;
    const tag = unique('bs').replace(/-/g, '');
    let solA: number;
    let solB: number;

    const ids = (r: any) => r.data.results.map((x: { id: number }) => x.id);
    const buscar = (q: string) =>
        api.get(`/api/financiacion-solicitudes?${new URLSearchParams({ q }).toString()}`, authHeaders(adToken));

    beforeAll(async () => {
        adToken = (await loginAsAdmin()).token;

        const cliA = await api.post('/api/clientes', { nombre: `Clara${tag}` }, authHeaders(adToken));
        const cliB = await api.post('/api/clientes', { nombre: `Dario${tag}` }, authHeaders(adToken));
        expect(cliA.status).toBe(201);
        expect(cliB.status).toBe(201);

        const fin = await api.post('/api/financieras', { nombre: `Banco${tag}`, tipo: 'banco' }, authHeaders(adToken));
        expect(fin.status).toBe(201);

        const a = await api.post('/api/financiacion-solicitudes', { clienteId: cliA.data.id, financieraId: fin.data.id }, authHeaders(adToken));
        const b = await api.post('/api/financiacion-solicitudes', { clienteId: cliB.data.id, financieraId: fin.data.id }, authHeaders(adToken));
        expect(a.status).toBe(201);
        expect(b.status).toBe(201);
        solA = a.data.id;
        solB = b.data.id;
    });

    test('por nombre del cliente trae solo la suya', async () => {
        const r = await buscar(`clara${tag}`);
        expect(r.status).toBe(200);
        expect(ids(r)).toEqual([solA]);
        expect(r.data.totalResults).toBe(1);
    });

    test('por nombre de la financiera trae las dos', async () => {
        const r = await buscar(`banco${tag}`);
        expect(r.status).toBe(200);
        expect(ids(r).sort()).toEqual([solA, solB].sort());
    });

    test('un texto que no coincide no devuelve nada', async () => {
        const r = await buscar(`nadie${tag}`);
        expect(r.status).toBe(200);
        expect(r.data.results).toHaveLength(0);
    });
});
