import { api, loginAsSuperAdmin, loginAsAdmin, authHeaders, unique } from './helpers';

/**
 * Búsqueda en el servidor (`?q=`) de Ventas, Presupuestos, Financiación y Reservas,
 * y el rango de fechas de Ventas (`fechaDesde`/`fechaHasta`). Antes el front filtraba
 * en memoria la página visible: lo que estaba en otra página no aparecía y "Ventas
 * del mes" contaba sólo las 20 filas cargadas.
 *
 * Todos los datos llevan un `tag` único, así las búsquedas no chocan con lo que
 * crean las otras suites en el mismo tenant.
 */
describe('Búsqueda q en los listados y ventas por fecha', () => {
    let saToken: string;
    let adToken: string;
    let tenantId: number;
    let vendedorId: number;
    let sucursalId: number;

    // Minúsculas y sin guiones: un solo término de búsqueda.
    const tag = unique('bq').replace(/-/g, '');
    const nomA = `Anabel${tag}`;
    const nomB = `Bruno${tag}`;
    const marcaX = `Marx${tag}`;
    const marcaY = `Mary${tag}`;
    const digitos = () => String(Math.floor(10_000_000 + Math.random() * 89_999_999));
    const dniA = digitos();
    const dniB = digitos();
    const dominioY = `QY${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    let cliA: number;
    let cliB: number;
    let vX: number;
    let vY: number;
    let ventaA: number;
    let ventaB: number;
    let presA: { id: number; nroPresupuesto: string };
    let presB: number;
    let resA: number;
    let resB: number;
    let finA: number;
    let finB: number;

    const ids = (r: any) => r.data.results.map((x: { id: number }) => x.id);
    const listar = (recurso: string, query: Record<string, string>) =>
        api.get(`/api/${recurso}?${new URLSearchParams(query).toString()}`, authHeaders(adToken));

    const nuevoCliente = async (nombre: string, dni: string) => {
        const r = await api.post('/api/clientes', { nombre, dni }, authHeaders(adToken));
        expect(r.status).toBe(201);
        return r.data.id as number;
    };

    const nuevoVehiculo = async (marca: string, modelo: string, dominio?: string) => {
        const r = await api.post(
            '/api/vehiculos',
            {
                marca, modelo, anio: 2021, concesionariaId: tenantId, sucursalId, ...(dominio ? { dominio } : {}),
                fechaIngreso: '2026-01-10T00:00:00Z', tipo: 'USADO', precioCompra: 5000, precioLista: 6000,
                estado: 'publicado', origen: 'compra', moneda: 'ARS',
            },
            authHeaders(saToken),
        );
        expect(r.status).toBe(201);
        return r.data.id as number;
    };

    beforeAll(async () => {
        const sa = await loginAsSuperAdmin();
        const ad = await loginAsAdmin();
        saToken = sa.token;
        adToken = ad.token;
        tenantId = ad.user.concesionariaId!;
        vendedorId = ad.user.id;

        const suc = await api.post('/api/sucursales', { nombre: unique('SucBq'), concesionariaId: tenantId }, authHeaders(saToken));
        expect(suc.status).toBe(201);
        sucursalId = suc.data.id;

        cliA = await nuevoCliente(nomA, dniA);
        cliB = await nuevoCliente(nomB, dniB);
        vX = await nuevoVehiculo(marcaX, 'Corolla');
        vY = await nuevoVehiculo(marcaY, 'Hilux', dominioY);
        // Las reservas van sobre otras unidades: X e Y se venden más abajo.
        const vRX = await nuevoVehiculo(marcaX, 'Etios');
        const vRY = await nuevoVehiculo(marcaY, 'Yaris');

        const presupuestar = (clienteId: number, vehiculoId: number) =>
            api.post(
                '/api/presupuestos',
                {
                    sucursalId, clienteId, vendedorId, moneda: 'ARS', fechaCreacion: '2026-03-01',
                    items: [{ vehiculoId, precioLista: 6000, descuento: 0, precioFinal: 6000 }],
                },
                authHeaders(adToken),
            );
        const pA = await presupuestar(cliA, vX);
        const pB = await presupuestar(cliB, vY);
        expect(pA.status).toBe(201);
        expect(pB.status).toBe(201);
        presA = { id: pA.data.id, nroPresupuesto: pA.data.nroPresupuesto };
        presB = pB.data.id;

        const reservar = (clienteId: number, vehiculoId: number) =>
            api.post(
                '/api/reservas',
                { sucursalId, vendedorId, clienteId, vehiculoId, monto: 500, moneda: 'ARS', fechaVencimiento: '2026-12-31' },
                authHeaders(adToken),
            );
        const rA = await reservar(cliA, vRX);
        const rB = await reservar(cliB, vRY);
        expect(rA.status).toBe(201);
        expect(rB.status).toBe(201);
        resA = rA.data.id;
        resB = rB.data.id;

        // Una venta el último día de marzo y otra el primero de abril: el borde del rango.
        const vender = (clienteId: number, vehiculoId: number, fecha: string) =>
            api.post(
                '/api/ventas',
                {
                    sucursalId, clienteId, vendedorId, vehiculoId, precioVenta: 6000, moneda: 'ARS',
                    formaPago: 'financiado_propio', fechaVenta: `${fecha}T00:00:00Z`,
                },
                authHeaders(adToken),
            );
        const vA = await vender(cliA, vX, '2026-03-31');
        const vB = await vender(cliB, vY, '2026-04-01');
        expect(vA.status).toBe(201);
        expect(vB.status).toBe(201);
        ventaA = vA.data.id;
        ventaB = vB.data.id;

        const financiar = (ventaId: number, clienteId: number) =>
            api.post(
                '/api/financiaciones',
                { ventaId, clienteId, fechaInicio: '2026-04-10', montoFinanciado: 3000, cuotas: 3, diaVencimiento: 10, moneda: 'ARS' },
                authHeaders(adToken),
            );
        const fA = await financiar(ventaA, cliA);
        const fB = await financiar(ventaB, cliB);
        expect(fA.status).toBe(201);
        expect(fB.status).toBe(201);
        finA = fA.data.id;
        finB = fB.data.id;
    });

    describe('ventas', () => {
        test('por nombre del cliente, sin importar mayúsculas', async () => {
            const r = await listar('ventas', { q: nomA.toUpperCase() });
            expect(r.status).toBe(200);
            expect(ids(r)).toEqual([ventaA]);
            expect(r.data.totalResults).toBe(1);
        });

        test('por DNI del cliente', async () => {
            const r = await listar('ventas', { q: dniB });
            expect(ids(r)).toEqual([ventaB]);
        });

        test('por dominio, marca y modelo de la unidad', async () => {
            expect(ids(await listar('ventas', { q: dominioY.toLowerCase() }))).toEqual([ventaB]);
            expect(ids(await listar('ventas', { q: marcaX }))).toEqual([ventaA]);
        });

        test('varias palabras: cada una tiene que aparecer en algún campo', async () => {
            expect(ids(await listar('ventas', { q: `${marcaX} corolla` }))).toEqual([ventaA]);
            // Bruno no compró el Corolla: no hay venta que cumpla las dos.
            expect(ids(await listar('ventas', { q: `${nomB} corolla` }))).toEqual([]);
        });

        test('por número de venta', async () => {
            const r = await listar('ventas', { q: String(ventaB) });
            expect(ids(r)).toContain(ventaB);
        });

        test('combina con los filtros y la paginación', async () => {
            const pagina = await listar('ventas', { q: tag, limit: '1' });
            expect(pagina.data.totalResults).toBe(2);
            expect(pagina.data.totalPages).toBe(2);
            expect(pagina.data.results).toHaveLength(1);

            const filtrada = await listar('ventas', { q: tag, clienteId: String(cliB) });
            expect(ids(filtrada)).toEqual([ventaB]);
        });

        test('q vacío o con espacios no filtra', async () => {
            const sin = await listar('ventas', {});
            const vacio = await listar('ventas', { q: '' });
            const espacios = await listar('ventas', { q: '   ' });
            expect(vacio.status).toBe(200);
            expect(vacio.data.totalResults).toBe(sin.data.totalResults);
            expect(espacios.data.totalResults).toBe(sin.data.totalResults);
            expect(sin.data.totalResults).toBeGreaterThanOrEqual(2);
        });
    });

    describe('ventas por fecha (fechaDesde / fechaHasta)', () => {
        test('el rango es inclusivo en las dos puntas', async () => {
            expect(ids(await listar('ventas', { q: tag, fechaDesde: '2026-03-31', fechaHasta: '2026-03-31' }))).toEqual([ventaA]);
            expect(ids(await listar('ventas', { q: tag, fechaDesde: '2026-04-01', fechaHasta: '2026-04-30' }))).toEqual([ventaB]);
            const ambas = await listar('ventas', { q: tag, fechaDesde: '2026-03-01', fechaHasta: '2026-04-30' });
            expect(ambas.data.totalResults).toBe(2);
        });

        test('cada punta funciona sola', async () => {
            expect(ids(await listar('ventas', { q: tag, fechaDesde: '2026-04-01' }))).toEqual([ventaB]);
            expect(ids(await listar('ventas', { q: tag, fechaHasta: '2026-03-31' }))).toEqual([ventaA]);
        });

        test('un mes entero se cuenta con totalResults (sin depender de la página)', async () => {
            const r = await listar('ventas', { fechaDesde: '2026-04-01', fechaHasta: '2026-04-30', limit: '1' });
            expect(r.status).toBe(200);
            expect(r.data.totalResults).toBeGreaterThanOrEqual(1);
        });

        test.each([
            ['31/03/2026', ''],
            ['2026-02-30', ''],
            ['', 'mañana'],
        ])('una fecha inválida (desde=%p hasta=%p) es 400 con mensaje en español', async (fechaDesde, fechaHasta) => {
            const r = await listar('ventas', { fechaDesde, fechaHasta });
            expect(r.status).toBe(400);
            expect(r.data.error).toBe('VALIDATION_ERROR');
            expect(r.data.message).toMatch(/no es válida: usá el formato AAAA-MM-DD/);
            expect(Array.isArray(r.data.details)).toBe(true);
        });

        test('desde posterior a hasta es 400', async () => {
            const r = await listar('ventas', { fechaDesde: '2026-04-02', fechaHasta: '2026-04-01' });
            expect(r.status).toBe(400);
            expect(r.data.message).toBe('La fecha «desde» no puede ser posterior a la fecha «hasta»');
        });
    });

    describe('presupuestos', () => {
        test('por cliente y por la unidad de sus ítems', async () => {
            expect(ids(await listar('presupuestos', { q: nomB.toUpperCase() }))).toEqual([presB]);
            expect(ids(await listar('presupuestos', { q: dominioY }))).toEqual([presB]);
            expect(ids(await listar('presupuestos', { q: `${marcaX} corolla` }))).toEqual([presA.id]);
        });

        test('por número de presupuesto', async () => {
            const r = await listar('presupuestos', { q: presA.nroPresupuesto.toLowerCase() });
            expect(r.status).toBe(200);
            expect(ids(r)).toContain(presA.id);
        });

        test('combina con el filtro por vehículo', async () => {
            expect(ids(await listar('presupuestos', { q: tag, vehiculoId: String(vY) }))).toEqual([presB]);
            expect(ids(await listar('presupuestos', { q: nomA, vehiculoId: String(vY) }))).toEqual([]);
        });
    });

    describe('reservas', () => {
        test('por cliente, unidad y número', async () => {
            expect(ids(await listar('reservas', { q: dniA }))).toEqual([resA]);
            expect(ids(await listar('reservas', { q: `${marcaY} yaris` }))).toEqual([resB]);
            expect(ids(await listar('reservas', { q: String(resA) }))).toContain(resA);
            const todas = await listar('reservas', { q: tag, estado: 'activa' });
            expect(todas.data.totalResults).toBe(2);
        });
    });

    describe('financiaciones', () => {
        test('por cliente y por la unidad de la venta', async () => {
            expect(ids(await listar('financiaciones', { q: nomA }))).toEqual([finA]);
            expect(ids(await listar('financiaciones', { q: `${marcaY} hilux` }))).toEqual([finB]);
            expect(ids(await listar('financiaciones', { q: dominioY }))).toEqual([finB]);
            expect(ids(await listar('financiaciones', { q: String(finB) }))).toContain(finB);
        });

        test('combina con la paginación', async () => {
            const r = await listar('financiaciones', { q: tag, limit: '1', page: '2' });
            expect(r.data.totalResults).toBe(2);
            expect(r.data.page).toBe(2);
            expect(r.data.results).toHaveLength(1);
        });
    });
});
