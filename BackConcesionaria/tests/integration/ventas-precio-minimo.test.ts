import { api, login, loginAsAdmin, authHeaders, unique, tryDelete, anularVenta } from './helpers';

/**
 * PROC-34: el circuito del precio mínimo controlaba quién VE el piso, no a cuánto
 * se VENDE. CreateVenta y ConvertPresupuestoToVenta aceptaban cualquier precio.
 *
 * Ahora, si la unidad tiene piso cargado y la venta queda por debajo (o va en otra
 * moneda y no se puede comparar), sólo pasa el admin o un vendedor con una
 * autorización VIGENTE suya para esa unidad — y nunca por debajo del valor
 * autorizado. La venta queda marcada `bajoPiso` y la auditoría dice cómo pasó.
 * Bajar el precio de lista, además, exige motivo.
 */
describe('Vender por debajo del precio mínimo (PROC-34)', () => {
    let adToken: string;
    let adminId: number;
    let vendedor: { id: number; token: string };
    let clienteId: number;
    const vehiculos: number[] = [];
    const ventas: number[] = [];

    const PISO = 9000;

    beforeAll(async () => {
        const ad = await loginAsAdmin();
        adToken = ad.token;
        adminId = ad.user.id;

        const roles = await api.get('/api/roles', authHeaders(adToken));
        const rolVendedor = (roles.data as Array<{ id: number; nombre: string }>).find((r) => r.nombre === 'vendedor');
        expect(rolVendedor).toBeDefined();
        const email = `${unique('piso-vend')}@demo.com`;
        const u = await api.post('/api/usuarios', {
            nombre: unique('VendPiso'), email, password: 'secret12345', roleIds: [rolVendedor!.id],
        }, authHeaders(adToken));
        expect(u.status).toBe(201);
        const s = await login(email, 'secret12345');
        vendedor = { id: u.data.id, token: s.token };

        const cli = await api.post('/api/clientes', { nombre: unique('CliPiso') }, authHeaders(adToken));
        expect(cli.status).toBe(201);
        clienteId = cli.data.id;
    });

    afterAll(async () => {
        for (const id of ventas) await anularVenta(id, adToken);
        for (const id of vehiculos) await tryDelete(`/api/vehiculos/${id}`, adToken);
        if (clienteId) await tryDelete(`/api/clientes/${clienteId}`, adToken);
        if (vendedor?.id) await tryDelete(`/api/usuarios/${vendedor.id}`, adToken);
    });

    async function unidad(conPiso = true): Promise<number> {
        const r = await api.post('/api/vehiculos', {
            marca: unique('MPiso'), modelo: 'Piso', anio: 2023, sucursalId: 1,
            fechaIngreso: '2026-04-25', tipo: 'USADO', precioCompra: 7000, precioLista: 10000,
            ...(conPiso ? { precioMinimo: PISO } : {}), moneda: 'ARS', estado: 'publicado', origen: 'compra',
        }, authHeaders(adToken));
        expect(r.status).toBe(201);
        vehiculos.push(r.data.id);
        return r.data.id;
    }

    const vender = async (token: string, vendedorId: number, vehiculoId: number, precioVenta: number, moneda = 'ARS') => {
        const res = await api.post('/api/ventas', {
            sucursalId: 1, clienteId, vendedorId, vehiculoId, precioVenta, moneda,
            formaPago: 'contado', fechaVenta: '2026-04-25',
        }, authHeaders(token));
        if (res.status === 201) ventas.push(res.data.id);
        return res;
    };

    const estadoDe = async (vehiculoId: number) =>
        (await api.get(`/api/vehiculos/${vehiculoId}`, authHeaders(adToken))).data.estado as string;

    const auditoriaDeAlta = async (ventaId: number) => {
        const logs = await api.get(`/api/auditoria?entidad=Venta&entidadId=${ventaId}&accion=create&limit=5`, authHeaders(adToken));
        expect(logs.status).toBe(200);
        return JSON.parse(String(logs.data.results[0].detalle).split('\n')[1]);
    };

    test('sobre el piso, el vendedor vende como siempre (sin marca)', async () => {
        const veh = await unidad();
        const res = await vender(vendedor.token, vendedor.id, veh, 9500);
        expect(res.status).toBe(201);
        expect(res.data.bajoPiso).toBe(false);
    });

    test('por debajo del piso y sin autorización → 403, sin decir el piso, y la unidad no se mueve', async () => {
        const veh = await unidad();
        const res = await vender(vendedor.token, vendedor.id, veh, 8000);
        expect(res.status).toBe(403);
        expect(res.data.error).toBe('PRECIO_BAJO_MINIMO');
        expect(res.data.message).toMatch(/Pedí la autorización del precio mínimo/);
        expect(res.data.message).not.toContain(String(PISO));
        expect(await estadoDe(veh)).toBe('publicado');
    });

    test('en otra moneda no se puede comparar: también pide autorización', async () => {
        const veh = await unidad();
        const res = await vender(vendedor.token, vendedor.id, veh, 50, 'USD');
        expect(res.status).toBe(403);
        expect(res.data.message).toMatch(/otra moneda/);
    });

    test('con autorización vigente vende hasta el valor AUTORIZADO, no por debajo; queda marcada y auditada', async () => {
        const veh = await unidad();
        const sol = await api.post('/api/precio-minimo', { vehiculoId: veh, motivo: 'El cliente ofrece 8600 en el acto' }, authHeaders(vendedor.token));
        expect(sol.status).toBe(201);
        const ok = await api.patch(`/api/precio-minimo/${sol.data.id}/resolver`, { autorizar: true, precioAutorizado: 8500 }, authHeaders(adToken));
        expect(ok.status).toBe(200);

        const debajoDelAutorizado = await vender(vendedor.token, vendedor.id, veh, 8000);
        expect(debajoDelAutorizado.status).toBe(403);
        expect(debajoDelAutorizado.data.message).toMatch(/incluso del precio mínimo que te autorizaron/);

        const venta = await vender(vendedor.token, vendedor.id, veh, 8600);
        expect(venta.status).toBe(201);
        expect(venta.data.bajoPiso).toBe(true);

        const audit = await auditoriaDeAlta(venta.data.id);
        expect(audit.piso).toEqual(expect.objectContaining({
            via: 'autorizacion', bajoPiso: true, comparable: true, solicitudId: sol.data.id, precioAutorizado: 8500,
        }));
        expect(audit.antes).toEqual({ estadoVehiculo: 'publicado' });
        expect(audit.despues).toEqual({ estadoVehiculo: 'vendido' });
    });

    test('la autorización es personal: la de un vendedor no le sirve al admin… ni falta, el admin pasa por su rol', async () => {
        const veh = await unidad();
        const venta = await vender(adToken, adminId, veh, 7000);
        expect(venta.status).toBe(201);
        expect(venta.data.bajoPiso).toBe(true);
        expect((await auditoriaDeAlta(venta.data.id)).piso).toEqual(expect.objectContaining({ via: 'admin', bajoPiso: true }));
    });

    test('convertir un presupuesto por debajo del piso tiene el mismo control', async () => {
        const veh = await unidad();
        const pres = await api.post('/api/presupuestos', {
            nroPresupuesto: unique('PPiso'), sucursalId: 1, clienteId, vendedorId: vendedor.id,
            moneda: 'ARS', fechaCreacion: '2026-04-20',
            items: [{ vehiculoId: veh, precioLista: 10000, descuento: 2500, precioFinal: 7500 }],
        }, authHeaders(vendedor.token));
        expect(pres.status).toBe(201);
        await api.patch(`/api/presupuestos/${pres.data.id}`, { estado: 'enviado' }, authHeaders(vendedor.token));
        await api.patch(`/api/presupuestos/${pres.data.id}`, { estado: 'aceptado' }, authHeaders(vendedor.token));

        const conv = await api.post(`/api/presupuestos/${pres.data.id}/convertir-en-venta`, {
            formaPago: 'contado', fechaVenta: '2026-04-27',
        }, authHeaders(vendedor.token));
        expect(conv.status).toBe(403);
        expect(conv.data.error).toBe('PRECIO_BAJO_MINIMO');
        expect(await estadoDe(veh)).toBe('publicado');
        await tryDelete(`/api/presupuestos/${pres.data.id}`, adToken);
    });

    test('sin piso cargado no hay nada que controlar', async () => {
        const veh = await unidad(false);
        const res = await vender(vendedor.token, vendedor.id, veh, 100);
        expect(res.status).toBe(201);
        expect(res.data.bajoPiso).toBe(false);
    });

    describe('bajar el precio de lista exige motivo', () => {
        test('sin motivo → 400 en el campo del motivo, y el precio no cambia', async () => {
            const veh = await unidad();
            const res = await api.patch(`/api/vehiculos/${veh}`, { precioLista: 9800 }, authHeaders(vendedor.token));
            expect(res.status).toBe(400);
            expect(res.data.details).toEqual([expect.objectContaining({ campo: 'motivoCambioPrecio' })]);
            const ficha = await api.get(`/api/vehiculos/${veh}`, authHeaders(adToken));
            expect(Number(ficha.data.precioLista)).toBe(10000);
        });

        test('con motivo baja y el motivo queda en el historial', async () => {
            const veh = await unidad();
            const res = await api.patch(`/api/vehiculos/${veh}`, {
                precioLista: 9800, motivoCambioPrecio: 'Más de 90 días en stock',
            }, authHeaders(vendedor.token));
            expect(res.status).toBe(200);
            const h = await api.get(`/api/vehiculo-precios/vehiculo/${veh}`, authHeaders(adToken));
            expect(h.data.find((x: any) => Number(x.precioNuevo) === 9800)?.motivo).toBe('Más de 90 días en stock');
        });

        test('subirlo no pide motivo', async () => {
            const veh = await unidad();
            const res = await api.patch(`/api/vehiculos/${veh}`, { precioLista: 10500 }, authHeaders(vendedor.token));
            expect(res.status).toBe(200);
        });
    });
});
