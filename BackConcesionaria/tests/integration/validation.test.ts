import { api, loginAsSuperAdmin, authHeaders, unique, tryDelete } from './helpers';

// Regresión de la capa de validación Zod (unificación express-validator → Zod, PR #13).
// Asegura que los endpoints migrados:
//   (a) rechazan input inválido con 400 VALIDATION_ERROR + `details` por campo,
//   (b) aceptan el input válido que hoy manda el front,
//   (c) descartan claves desconocidas (anti mass-assignment; Zod strippea lo no declarado),
//   (d) replican la tolerancia previa de express-validator (email '' → skip / checkFalsy).
// Como super_admin, la extensión RLS NO inyecta concesionariaId → se pasa explícito.
describe('Validación Zod (endpoints migrados de express-validator)', () => {
    let token: string;
    let concesionariaId: number;
    const creados: string[] = [];

    beforeAll(async () => {
        const sa = await loginAsSuperAdmin();
        token = sa.token;
        concesionariaId = sa.user.concesionariaId!;
    });

    afterAll(async () => {
        for (const path of creados.reverse()) await tryDelete(path, token);
    });

    const expectValidationError = (resp: any) => {
        expect(resp.status).toBe(400);
        expect(resp.data.error).toBe('VALIDATION_ERROR');
        expect(Array.isArray(resp.data.details)).toBe(true);
        expect(resp.data.details.length).toBeGreaterThan(0);
    };

    // ── (a) Campo requerido faltante → 400 ──
    test('cliente sin nombre → 400 con detalle', async () => {
        const r = await api.post('/api/clientes', { concesionariaId }, authHeaders(token));
        expectValidationError(r);
    });

    test('proveedor sin nombre → 400', async () => {
        const r = await api.post('/api/proveedores', { tipo: 'taller', concesionariaId }, authHeaders(token));
        expectValidationError(r);
    });

    test('sucursal sin nombre → 400', async () => {
        const r = await api.post('/api/sucursales', { concesionariaId }, authHeaders(token));
        expectValidationError(r);
    });

    test('postventa-tipo sin nombre → 400', async () => {
        const r = await api.post('/api/postventa-tipos', { concesionariaId }, authHeaders(token));
        expectValidationError(r);
    });

    // ── (a) Enum inválido → 400 ──
    test('financiera con tipo (enum) inválido → 400', async () => {
        const r = await api.post('/api/financieras', { nombre: unique('Fin'), tipo: 'inexistente', concesionariaId }, authHeaders(token));
        expectValidationError(r);
    });

    test('vehiculo con tipo (enum) inválido → 400', async () => {
        const r = await api.post('/api/vehiculos', {
            marca: 'X', modelo: 'Y', anio: 2020, concesionariaId, sucursalId: 1,
            fechaIngreso: '2026-04-25T00:00:00Z', tipo: 'ENUM_INVALIDO',
            precioCompra: 1000, precioLista: 1500, estado: 'preparacion', origen: 'compra',
        }, authHeaders(token));
        expectValidationError(r);
    });

    // ── (d) Email: formato inválido → 400; vacío '' → OK (checkFalsy replicado) ──
    test('cliente con email inválido → 400', async () => {
        const r = await api.post('/api/clientes', { nombre: unique('Cli'), email: 'no-es-email', concesionariaId }, authHeaders(token));
        expectValidationError(r);
    });

    test('cliente con email "" → 201 (checkFalsy: se acepta sin email)', async () => {
        const r = await api.post('/api/clientes', { nombre: unique('CliVacio'), email: '', concesionariaId }, authHeaders(token));
        expect(r.status).toBe(201);
        creados.push(`/api/clientes/${r.data.id}`);
    });

    // ── (b) Input válido → 201 ──
    test('financiera válida (tipo banco) → 201', async () => {
        const r = await api.post('/api/financieras', { nombre: unique('FinOk'), tipo: 'banco', concesionariaId }, authHeaders(token));
        expect(r.status).toBe(201);
        creados.push(`/api/financieras/${r.data.id}`);
    });

    // ── (c) Mass-assignment: claves inyectadas se descartan ──
    test('cliente válido con id/deletedAt inyectados → se descartan', async () => {
        const r = await api.post('/api/clientes', {
            nombre: unique('CliInj'), concesionariaId,
            id: 999999, deletedAt: '2020-01-01T00:00:00Z', hackField: 'x',
        }, authHeaders(token));
        expect(r.status).toBe(201);
        // el id real es autogenerado (no el inyectado) y el registro NO quedó pre-borrado
        expect(r.data.id).not.toBe(999999);
        expect(r.data.deletedAt).toBeFalsy();
        creados.push(`/api/clientes/${r.data.id}`);
    });
});
