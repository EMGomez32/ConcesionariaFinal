import { api, loginAsAdmin, authHeaders, unique, tryDelete } from './helpers';

/**
 * Completar una tasación en el lugar + dominio obligatorio.
 *
 * El agujero que cierra: una permuta cargada sin valor quedaba "sin tasar" y NO
 * había forma de completarla —ni en la atención ni en la lista— así que el
 * tasador terminaba creando OTRA (duplicado). Ahora `PATCH /tasaciones/:id`
 * actualiza la MISMA fila. Y el dominio pasa a ser obligatorio: sin la patente
 * el tasador no sabe qué auto revisar.
 */
describe('Tasaciones — completar en el lugar + dominio obligatorio', () => {
    let adminToken: string;
    const creadas: number[] = [];

    beforeAll(async () => {
        const admin = await loginAsAdmin();
        adminToken = admin.token;
    });

    afterAll(async () => {
        for (const id of creadas) await tryDelete(`/api/tasaciones/${id}`, adminToken);
    });

    const base = () => ({
        marca: 'Volkswagen',
        modelo: unique('Gol'),
        fecha: '2026-08-26',
    });

    test('POST sin dominio => 400 (ahora es obligatorio)', async () => {
        const res = await api.post('/api/tasaciones', base(), authHeaders(adminToken));
        expect(res.status).toBe(400);
    });

    test('POST con dominio y SIN valor => 201, queda pendiente (valorEstimado null)', async () => {
        const res = await api.post(
            '/api/tasaciones',
            { ...base(), dominio: unique('AB').slice(0, 8) },
            authHeaders(adminToken),
        );
        expect(res.status).toBe(201);
        expect(res.data.valorEstimado ?? null).toBeNull();
        creadas.push(res.data.id);
    });

    test('PATCH le pone el valor a esa MISMA tasación (no crea otra)', async () => {
        // Alta pendiente.
        const alta = await api.post(
            '/api/tasaciones',
            { ...base(), dominio: unique('CD').slice(0, 8) },
            authHeaders(adminToken),
        );
        expect(alta.status).toBe(201);
        const id = alta.data.id;
        creadas.push(id);

        // Cuántas tasaciones hay antes de tasar (para probar que NO se crea otra).
        const antes = await api.get('/api/tasaciones?limit=100', authHeaders(adminToken));
        const totalAntes = antes.data.totalResults;

        // Tasar: le ponemos el valor.
        const patch = await api.patch(
            `/api/tasaciones/${id}`,
            { valorEstimado: 8500000, moneda: 'ARS' },
            authHeaders(adminToken),
        );
        expect(patch.status).toBe(200);
        expect(Number(patch.data.valorEstimado)).toBe(8500000);
        // Es la MISMA fila: mismo id.
        expect(patch.data.id).toBe(id);

        // Y no apareció una tasación nueva.
        const despues = await api.get('/api/tasaciones?limit=100', authHeaders(adminToken));
        expect(despues.data.totalResults).toBe(totalAntes);

        // Persistió: un GET lo confirma.
        const check = await api.get(`/api/tasaciones/${id}`, authHeaders(adminToken));
        expect(Number(check.data.valorEstimado)).toBe(8500000);
    });

    test('PATCH sin valor (sólo observaciones) => 200 y sigue pendiente', async () => {
        const alta = await api.post(
            '/api/tasaciones',
            { ...base(), dominio: unique('EF').slice(0, 8) },
            authHeaders(adminToken),
        );
        const id = alta.data.id;
        creadas.push(id);

        const patch = await api.patch(
            `/api/tasaciones/${id}`,
            { observaciones: 'Falta que la vea el taller' },
            authHeaders(adminToken),
        );
        expect(patch.status).toBe(200);
        expect(patch.data.valorEstimado ?? null).toBeNull();
    });

    test('PATCH a una tasación inexistente => 404', async () => {
        const res = await api.patch(
            '/api/tasaciones/99999999',
            { valorEstimado: 1000000 },
            authHeaders(adminToken),
        );
        expect(res.status).toBe(404);
    });
});
