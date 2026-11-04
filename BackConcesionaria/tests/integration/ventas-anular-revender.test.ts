import { api, loginAsAdmin, loginAsSuperAdmin, authHeaders, unique, tryDelete } from './helpers';

/**
 * PROC-31: anular una venta y volver a vender la misma unidad.
 *
 * `Venta.vehiculoId` era `@unique` TOTAL (índice `ventas_vehiculo_id_key`). Anular
 * una venta es un soft-delete: la fila queda con `deleted_at` y sigue ocupando el
 * índice. DeleteVenta devuelve la unidad a `publicado`, la pantalla la ofrece para
 * la venta, y el segundo POST /ventas reventaba contra el índice (P2002 → 400 "Ya
 * existe un registro con ese vehiculo_id"): la unidad quedaba publicada e
 * invendible y el único arreglo era tocar la base a mano. Lo mismo con
 * `presupuestoId @unique`: un presupuesto cuya venta se anuló no se podía volver a
 * convertir. El schema de `Financiacion` ya documentaba este mismo pozo.
 */
describe('Anular una venta y revender la unidad (PROC-31)', () => {
    let adToken: string;
    let saToken: string;
    let tenantId: number;
    let vendedorId: number;
    let clienteId: number;
    const vehiculos: number[] = [];
    const presupuestos: number[] = [];

    beforeAll(async () => {
        const ad = await loginAsAdmin();
        const sa = await loginAsSuperAdmin();
        adToken = ad.token;
        saToken = sa.token;
        tenantId = ad.user.concesionariaId!;
        vendedorId = ad.user.id;
        const cli = await api.post('/api/clientes', { nombre: unique('CliReventa') }, authHeaders(adToken));
        expect(cli.status).toBe(201);
        clienteId = cli.data.id;
    });

    afterAll(async () => {
        for (const id of presupuestos) await tryDelete(`/api/presupuestos/${id}`, adToken);
        for (const id of vehiculos) await tryDelete(`/api/vehiculos/${id}`, adToken);
        if (clienteId) await tryDelete(`/api/clientes/${clienteId}`, adToken);
    });

    async function nuevoVehiculo(): Promise<number> {
        const r = await api.post('/api/vehiculos', {
            marca: unique('MRev'), modelo: 'Reventa', anio: 2022, concesionariaId: tenantId, sucursalId: 1,
            fechaIngreso: '2026-04-25T00:00:00Z', tipo: 'USADO', precioCompra: 5000, precioLista: 6000,
            estado: 'publicado', origen: 'compra',
        }, authHeaders(saToken));
        expect(r.status).toBe(201);
        vehiculos.push(r.data.id);
        return r.data.id;
    }

    const vender = (vehiculoId: number) => api.post('/api/ventas', {
        sucursalId: 1, clienteId, vendedorId, vehiculoId, precioVenta: 6000, moneda: 'ARS',
        formaPago: 'contado', fechaVenta: '2026-04-25',
    }, authHeaders(adToken));

    const anular = (ventaId: number) =>
        api.delete(`/api/ventas/${ventaId}`, authHeaders(adToken));

    const estadoDe = async (vehiculoId: number) =>
        (await api.get(`/api/vehiculos/${vehiculoId}`, authHeaders(adToken))).data.estado as string;

    test('la unidad de una venta anulada se puede volver a vender', async () => {
        const veh = await nuevoVehiculo();

        const primera = await vender(veh);
        expect(primera.status).toBe(201);
        expect(await estadoDe(veh)).toBe('vendido');

        const anulada = await anular(primera.data.id);
        expect(anulada.status).toBe(204);
        expect(await estadoDe(veh)).toBe('publicado');

        // Antes: 400 "Ya existe un registro con ese vehiculo_id" (la fila anulada
        // seguía ocupando el índice único total).
        const segunda = await vender(veh);
        expect(segunda.status).toBe(201);
        expect(segunda.data.id).not.toBe(primera.data.id);
        expect(await estadoDe(veh)).toBe('vendido');

        // Y se puede anular y revender más de una vez: el índice parcial no
        // cuenta las filas anuladas, por muchas que haya.
        expect((await anular(segunda.data.id)).status).toBe(204);
        const tercera = await vender(veh);
        expect(tercera.status).toBe(201);
        expect((await anular(tercera.data.id)).status).toBe(204);
    });

    test('la unidad vendida (venta viva) sigue sin poder venderse dos veces', async () => {
        // La contracara: abrir el índice a las anuladas no puede abrirlo a las vivas.
        const veh = await nuevoVehiculo();
        const primera = await vender(veh);
        expect(primera.status).toBe(201);
        const doble = await vender(veh);
        expect(doble.status).toBe(400);
        expect(doble.data?.error).toBe('VEHICULO_VENDIDO');
        expect((await anular(primera.data.id)).status).toBe(204);
    });

    test('un presupuesto cuya venta se anuló se puede volver a convertir', async () => {
        const veh = await nuevoVehiculo();
        const pres = await api.post('/api/presupuestos', {
            nroPresupuesto: unique('PRev'), sucursalId: 1, clienteId, vendedorId,
            moneda: 'ARS', fechaCreacion: '2026-04-20',
            items: [{ vehiculoId: veh, precioLista: 6000, descuento: 0, precioFinal: 6000 }],
        }, authHeaders(adToken));
        expect(pres.status).toBe(201);
        presupuestos.push(pres.data.id);
        expect((await api.patch(`/api/presupuestos/${pres.data.id}`, { estado: 'enviado' }, authHeaders(adToken))).status).toBe(200);
        expect((await api.patch(`/api/presupuestos/${pres.data.id}`, { estado: 'aceptado' }, authHeaders(adToken))).status).toBe(200);

        const convertir = () => api.post(`/api/presupuestos/${pres.data.id}/convertir-en-venta`, {
            formaPago: 'contado', moneda: 'ARS', fechaVenta: '2026-04-27',
        }, authHeaders(adToken));

        const primera = await convertir();
        expect(primera.status).toBe(201);
        expect(primera.data.presupuestoId).toBe(pres.data.id);
        expect((await anular(primera.data.id)).status).toBe(204);

        // Antes: 400 "Ya existe un registro con ese presupuesto_id".
        const segunda = await convertir();
        expect(segunda.status).toBe(201);
        expect(segunda.data.presupuestoId).toBe(pres.data.id);
        expect((await anular(segunda.data.id)).status).toBe(204);
    });
});
