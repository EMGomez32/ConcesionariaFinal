import { api, loginAsSuperAdmin, authHeaders, unique, tryDelete } from './helpers';

/**
 * APP-16: las rutas de billing de super_admin validan el body con Zod (antes pasaban
 * `req.body` crudo a Prisma). Flujo real contra una concesionaria creada por el test, para no
 * tocar la suscripción del tenant de la suite.
 */
describe('Billing de super_admin: el body se valida', () => {
    let saTok: string;
    let tenantId: number;
    let planId: number;

    beforeAll(async () => {
        saTok = (await loginAsSuperAdmin()).token;
        const t = await api.post('/api/concesionarias', { nombre: unique('TenantBilling'), cuit: `20-${Date.now()}-7` }, authHeaders(saTok));
        expect(t.status).toBe(201);
        tenantId = t.data.id;
    });

    afterAll(async () => { await tryDelete(`/api/concesionarias/${tenantId}`, saTok); });

    test('plan: el alta válida funciona y un payload con otra forma da 400, no 500', async () => {
        const ok = await api.post('/api/billing/planes', { nombre: unique('Plan'), interval: 'MONTH', precio: '25000', moneda: 'ARS' }, authHeaders(saTok));
        expect(ok.status).toBe(201);
        planId = ok.data.id;

        const malo = await api.post('/api/billing/planes', { nombre: unique('Plan'), interval: 'SEMANA', precio: 'mucho' }, authHeaders(saTok));
        expect(malo.status).toBe(400);
        expect(malo.data.error).toBe('VALIDATION_ERROR');

        const upd = await api.patch(`/api/billing/planes/${planId}`, { precio: 30000, deletedAt: '2020-01-01T00:00:00Z' }, authHeaders(saTok));
        expect(upd.status).toBe(200);
        // `deletedAt` no entró: el plan sigue vivo en el catálogo.
        const planes = await api.get('/api/billing/planes', authHeaders(saTok));
        expect((planes.data as any[]).some((p) => p.id === planId)).toBe(true);
    });

    test('suscripción + factura con fechas del <input type="date"> (YYYY-MM-DD)', async () => {
        const sub = await api.patch(`/api/billing/concesionarias/${tenantId}/subscription`,
            { planId, status: 'trialing', trialEndsAt: '2026-12-31', currentPeriodStart: '2026-11-01' }, authHeaders(saTok));
        expect({ status: sub.status, data: sub.data }).toMatchObject({ status: 200 });

        expect((await api.patch(`/api/billing/concesionarias/${tenantId}/subscription`, { status: 'active' }, authHeaders(saTok))).status).toBe(400);

        const inv = await api.post('/api/billing/invoices',
            { subscriptionId: sub.data.id, subtotal: 1000, impuestos: 210, periodoDesde: '2026-11-01', periodoHasta: '2026-11-30' }, authHeaders(saTok));
        expect({ status: inv.status, data: inv.data }).toMatchObject({ status: 201 });

        const pdfMalo = await api.post('/api/billing/invoices', { subscriptionId: sub.data.id, subtotal: 1, pdfUrl: 'javascript:alert(1)' }, authHeaders(saTok));
        expect(pdfMalo.status).toBe(400);
    });
});
