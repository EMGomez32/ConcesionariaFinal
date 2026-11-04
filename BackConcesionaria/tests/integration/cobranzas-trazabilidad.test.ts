import { api, loginAsAdmin, loginAsSuperAdmin, authHeaders, unique, tryDelete } from './helpers';

/**
 * PROC-35: el cobro de una cuota queda trazable.
 *
 *  - La `referencia` (n° de transferencia / recibo / cheque) y las observaciones se
 *    GUARDAN: antes RegistrarPagoCuota las aceptaba y las tiraba, y el cobro no se
 *    podía conciliar contra el banco.
 *  - El detalle del contrato trae los cobros de cada cuota.
 *  - La auditoría del cobro se escribe en la MISMA transacción, con lo cobrado y el
 *    saldo/estado de la cuota antes y después; un reenvío idempotente no deja un
 *    segundo rastro (igual que no deja un segundo cobro).
 */
describe('Cobranzas: referencia persistida y auditoría con antes/después (PROC-35)', () => {
    let adToken: string;
    let clienteId: number;
    let financiacionId: number;
    let cuota1: { id: number; nroCuota: number; montoCuota: string };

    beforeAll(async () => {
        const ad = await loginAsAdmin();
        const sa = await loginAsSuperAdmin();
        adToken = ad.token;
        const cli = await api.post('/api/clientes', { nombre: unique('CliCobro') }, authHeaders(adToken));
        expect(cli.status).toBe(201);
        clienteId = cli.data.id;
        const veh = await api.post('/api/vehiculos', {
            marca: unique('MCobro'), modelo: 'C', anio: 2022, concesionariaId: ad.user.concesionariaId, sucursalId: 1,
            fechaIngreso: '2026-04-25', tipo: 'USADO', precioCompra: 5000, precioLista: 6000,
            estado: 'publicado', origen: 'compra',
        }, authHeaders(sa.token));
        expect(veh.status).toBe(201);
        const venta = await api.post('/api/ventas', {
            sucursalId: 1, clienteId, vendedorId: ad.user.id, vehiculoId: veh.data.id, precioVenta: 6000, moneda: 'ARS',
            formaPago: 'financiado_propio', fechaVenta: '2026-04-25',
        }, authHeaders(adToken));
        expect(venta.status).toBe(201);
        const fin = await api.post('/api/financiaciones', {
            ventaId: venta.data.id, clienteId, fechaInicio: '2026-05-10', diaVencimiento: 10, moneda: 'ARS',
            montoFinanciado: 3000, cuotas: 3,
        }, authHeaders(adToken));
        expect(fin.status).toBe(201);
        financiacionId = fin.data.id;
        cuota1 = [...fin.data.cuotasPlan].sort((a: any, b: any) => a.nroCuota - b.nroCuota)[0];
    });

    afterAll(async () => {
        if (financiacionId) await tryDelete(`/api/financiaciones/${financiacionId}`, adToken);
        if (clienteId) await tryDelete(`/api/clientes/${clienteId}`, adToken);
    });

    test('la referencia y las observaciones del cobro se guardan y vuelven en el detalle del contrato', async () => {
        const key = unique('idem-cobro');
        const pago = await api.patch(`/api/financiaciones/cuotas/${cuota1.id}/pagar`, {
            monto: 400, metodo: 'transferencia', referencia: '  TRF-000123  ', observaciones: 'Pagó la hermana',
            idempotencyKey: key,
        }, authHeaders(adToken));
        expect(pago.status).toBe(200);
        expect(pago.data.estado).toBe('parcial');

        // Reenvío con la MISMA clave: no cobra dos veces...
        const reenvio = await api.patch(`/api/financiaciones/cuotas/${cuota1.id}/pagar`, {
            monto: 400, metodo: 'transferencia', referencia: 'TRF-000123', idempotencyKey: key,
        }, authHeaders(adToken));
        expect(reenvio.status).toBe(200);

        const det = await api.get(`/api/financiaciones/${financiacionId}`, authHeaders(adToken));
        const cuota = det.data.cuotasPlan.find((c: any) => c.id === cuota1.id);
        expect(cuota.pagos).toEqual([expect.objectContaining({
            monto: '400', metodo: 'transferencia', referencia: 'TRF-000123', observaciones: 'Pagó la hermana',
        })]);
        // La clave de idempotencia no viaja al front.
        expect(cuota.pagos[0].idempotencyKey).toBeUndefined();
    });

    test('el cobro deja UN rastro con lo cobrado y el saldo antes/después', async () => {
        const logs = await api.get(
            `/api/auditoria?entidad=Financiacion&entidadId=${financiacionId}&accion=update&limit=20`,
            authHeaders(adToken),
        );
        expect(logs.status).toBe(200);
        const cobros = logs.data.results.filter((l: any) => String(l.detalle).startsWith(`Cobro de la cuota ${cuota1.nroCuota} `));
        // ...ni deja dos rastros.
        expect(cobros).toHaveLength(1);
        const [frase, cambio] = String(cobros[0].detalle).split('\n');
        expect(frase).toContain('ref. TRF-000123');
        const json = JSON.parse(cambio);
        expect(json.pago).toEqual(expect.objectContaining({ monto: 400, metodo: 'transferencia', referencia: 'TRF-000123' }));
        expect(json.antes).toEqual({ saldoCuota: Number(cuota1.montoCuota), estado: 'pendiente' });
        expect(json.despues).toEqual({ saldoCuota: Number(cuota1.montoCuota) - 400, estado: 'parcial' });
    });

    test('sin referencia el cobro se registra igual (no es obligatoria)', async () => {
        const res = await api.patch(`/api/financiaciones/cuotas/${cuota1.id}/pagar`, {
            monto: 100, metodo: 'efectivo', idempotencyKey: unique('idem-sinref'),
        }, authHeaders(adToken));
        expect(res.status).toBe(200);
    });
});
