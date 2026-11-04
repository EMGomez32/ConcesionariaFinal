import { api, loginAsAdmin, loginAsSuperAdmin, authHeaders, unique, tryDelete, anularVenta } from './helpers';

/**
 * PROC-30: anular una venta deja de ser un borrado sin motivo y sin chequeos.
 *
 *  - El motivo es obligatorio (mínimo 10 caracteres) y queda en la venta y en la
 *    auditoría, con el antes/después.
 *  - No se anula si queda plata colgando: pagos sin quitar, un contrato vivo o un
 *    contrato con cuotas cobradas (aunque esté cancelado). Cada cosa se revierte
 *    antes por su camino. (La factura AFIP real la cubre el unit test: en CI sólo
 *    existe el modo mock, que no bloquea.)
 *  - El reporte GET /ventas/anuladas lista la baja con su motivo y quién la hizo.
 *  - La otra "anulación" (estado de entrega `cancelada`) también pide motivo.
 */
describe('Anular una venta: motivo, bloqueos y reporte (PROC-30)', () => {
    let adToken: string;
    let saToken: string;
    let tenantId: number;
    let adminId: number;
    let clienteId: number;
    const vehiculos: number[] = [];
    const financiaciones: number[] = [];

    beforeAll(async () => {
        const ad = await loginAsAdmin();
        const sa = await loginAsSuperAdmin();
        adToken = ad.token;
        saToken = sa.token;
        tenantId = ad.user.concesionariaId!;
        adminId = ad.user.id;
        const cli = await api.post('/api/clientes', { nombre: unique('CliAnul') }, authHeaders(adToken));
        expect(cli.status).toBe(201);
        clienteId = cli.data.id;
    });

    afterAll(async () => {
        for (const id of financiaciones) await tryDelete(`/api/financiaciones/${id}`, adToken);
        for (const id of vehiculos) await tryDelete(`/api/vehiculos/${id}`, adToken);
        if (clienteId) await tryDelete(`/api/clientes/${clienteId}`, adToken);
    });

    async function nuevaVenta(extra: Record<string, unknown> = {}): Promise<number> {
        const veh = await api.post('/api/vehiculos', {
            marca: unique('MAnul'), modelo: 'Anulable', anio: 2022, concesionariaId: tenantId, sucursalId: 1,
            fechaIngreso: '2026-04-25T00:00:00Z', tipo: 'USADO', precioCompra: 5000, precioLista: 6000,
            estado: 'publicado', origen: 'compra',
        }, authHeaders(saToken));
        expect(veh.status).toBe(201);
        vehiculos.push(veh.data.id);
        const v = await api.post('/api/ventas', {
            sucursalId: 1, clienteId, vendedorId: adminId, vehiculoId: veh.data.id, precioVenta: 6000,
            moneda: 'ARS', formaPago: 'contado', fechaVenta: '2026-04-25', ...extra,
        }, authHeaders(adToken));
        expect(v.status).toBe(201);
        return v.data.id;
    }

    const sigueViva = async (ventaId: number) =>
        (await api.get(`/api/ventas/${ventaId}`, authHeaders(adToken))).status === 200;

    describe('el motivo es obligatorio', () => {
        test('DELETE sin body → 400 pidiendo el motivo, y la venta sigue viva', async () => {
            const ventaId = await nuevaVenta();
            const res = await api.delete(`/api/ventas/${ventaId}`, authHeaders(adToken));
            expect(res.status).toBe(400);
            expect(res.data.error).toBe('VALIDATION_ERROR');
            expect(res.data.details).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'motivo' })]));
            expect(res.data.message).toMatch(/motivo/i);
            expect(await sigueViva(ventaId)).toBe(true);
            expect((await anularVenta(ventaId, adToken)).status).toBe(204);
        });

        test('un motivo de compromiso ("error") no alcanza', async () => {
            const ventaId = await nuevaVenta();
            const res = await anularVenta(ventaId, adToken, 'error');
            expect(res.status).toBe(400);
            expect(res.data.message).toMatch(/al menos 10 caracteres/);
            expect(await sigueViva(ventaId)).toBe(true);
            expect((await anularVenta(ventaId, adToken)).status).toBe(204);
        });
    });

    describe('no se anula con plata colgando', () => {
        test('con un pago registrado → 409 ANULACION_BLOQUEADA; quitado el pago, se anula', async () => {
            const ventaId = await nuevaVenta({ pagos: [{ monto: 2000, metodo: 'transferencia', referencia: 'TRF-1' }] });
            const bloqueada = await anularVenta(ventaId, adToken);
            expect(bloqueada.status).toBe(409);
            expect(bloqueada.data.error).toBe('ANULACION_BLOQUEADA');
            expect(bloqueada.data.message).toMatch(/1 pago registrado/);
            expect(bloqueada.data.details.bloqueos).toEqual([expect.objectContaining({ tipo: 'pagos' })]);
            expect(await sigueViva(ventaId)).toBe(true);

            // La reversa es por su camino (admin, auditada): quitar el pago.
            const [pagoId] = bloqueada.data.details.bloqueos[0].ids;
            expect((await api.delete(`/api/ventas/${ventaId}/pagos/${pagoId}`, authHeaders(adToken))).status).toBe(204);
            expect((await anularVenta(ventaId, adToken)).status).toBe(204);
        });

        test('con una financiación activa → 409; anulado el contrato, se anula', async () => {
            const ventaId = await nuevaVenta({ formaPago: 'financiado_propio' });
            const fin = await api.post('/api/financiaciones', {
                ventaId, clienteId, fechaInicio: '2026-05-10', diaVencimiento: 10, moneda: 'ARS',
                montoFinanciado: 3000, cuotas: 3,
            }, authHeaders(adToken));
            expect(fin.status).toBe(201);
            financiaciones.push(fin.data.id);

            const bloqueada = await anularVenta(ventaId, adToken);
            expect(bloqueada.status).toBe(409);
            expect(bloqueada.data.message).toMatch(/financiación N° \d{6} está activa/);

            expect((await api.delete(`/api/financiaciones/${fin.data.id}`, authHeaders(adToken))).status).toBe(204);
            expect((await anularVenta(ventaId, adToken)).status).toBe(204);
        });

        test('un contrato CANCELADO con cuotas cobradas también bloquea: esa plata entró', async () => {
            const ventaId = await nuevaVenta({ formaPago: 'financiado_propio' });
            const fin = await api.post('/api/financiaciones', {
                ventaId, clienteId, fechaInicio: '2026-05-10', diaVencimiento: 10, moneda: 'ARS',
                montoFinanciado: 3000, cuotas: 3,
            }, authHeaders(adToken));
            expect(fin.status).toBe(201);
            financiaciones.push(fin.data.id);
            const cuota1 = [...fin.data.cuotasPlan].sort((a: any, b: any) => a.nroCuota - b.nroCuota)[0];
            const pago = await api.patch(`/api/financiaciones/cuotas/${cuota1.id}/pagar`, {
                monto: 1000, metodo: 'efectivo', idempotencyKey: unique('idem-anul'),
            }, authHeaders(adToken));
            expect(pago.status).toBe(200);
            const cancelar = await api.patch(`/api/financiaciones/${fin.data.id}`, {
                estado: 'cancelada', motivo: 'Cancelación del contrato para el test de anulación',
            }, authHeaders(adToken));
            expect(cancelar.status).toBe(200);

            const bloqueada = await anularVenta(ventaId, adToken);
            expect(bloqueada.status).toBe(409);
            expect(bloqueada.data.message).toMatch(/tiene 1 cuota cobrada/);
            expect(bloqueada.data.message).not.toMatch(/está cancelada/);

            expect((await api.delete(`/api/financiaciones/${fin.data.id}`, authHeaders(adToken))).status).toBe(204);
            expect((await anularVenta(ventaId, adToken)).status).toBe(204);
        });
    });

    describe('la anulación queda consultable', () => {
        const MOTIVO = `El cliente desistió de la compra (${unique('mot')})`;
        let ventaId: number;

        beforeAll(async () => {
            ventaId = await nuevaVenta();
            expect((await anularVenta(ventaId, adToken, `  ${MOTIVO}  `)).status).toBe(204);
        });

        test('GET /ventas/anuladas la lista con el motivo (recortado) y quién la anuló', async () => {
            const res = await api.get('/api/ventas/anuladas?limit=100', authHeaders(adToken));
            expect(res.status).toBe(200);
            const fila = res.data.results.find((v: any) => v.id === ventaId);
            expect(fila).toBeDefined();
            expect(fila.motivoAnulacion).toBe(MOTIVO);
            expect(fila.anuladaPor).toEqual({ id: adminId, nombre: expect.any(String) });
            expect(fila.anuladaEn).toBeTruthy();
            // Proyección cerrada: nada del costo de la unidad.
            expect(fila.vehiculo?.precioCompra).toBeUndefined();
        });

        test('la venta anulada ya no aparece en el listado normal', async () => {
            expect((await api.get(`/api/ventas/${ventaId}`, authHeaders(adToken))).status).toBe(404);
        });

        test('la auditoría tiene el motivo y el antes/después', async () => {
            const res = await api.get(`/api/auditoria?entidad=Venta&entidadId=${ventaId}&limit=10`, authHeaders(adToken));
            expect(res.status).toBe(200);
            const baja = res.data.results.find((l: any) => l.accion === 'delete_soft');
            expect(baja).toBeDefined();
            expect(baja.detalle).toContain(MOTIVO);
            const json = JSON.parse(String(baja.detalle).split('\n')[1]);
            expect(json.antes).toEqual({ anulada: false, estadoVehiculo: 'vendido' });
            expect(json.despues).toEqual(expect.objectContaining({ anulada: true, estadoVehiculo: 'publicado' }));
        });

        test('una venta ya anulada no se vuelve a anular (404)', async () => {
            expect((await anularVenta(ventaId, adToken)).status).toBe(404);
        });
    });

    describe('estado de entrega `cancelada` (la otra anulación) también pide motivo', () => {
        test('sin motivo → 400; con motivo → 200 y queda en la auditoría', async () => {
            const ventaId = await nuevaVenta();
            const sinMotivo = await api.patch(`/api/ventas/${ventaId}/estado-entrega`, { estadoEntrega: 'cancelada' }, authHeaders(adToken));
            expect(sinMotivo.status).toBe(400);
            expect(sinMotivo.data.details).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'motivo' })]));

            const motivo = 'Operación caída: el cliente no consiguió el crédito';
            const ok = await api.patch(`/api/ventas/${ventaId}/estado-entrega`, { estadoEntrega: 'cancelada', motivo }, authHeaders(adToken));
            expect(ok.status).toBe(200);
            expect(ok.data.estadoEntrega).toBe('cancelada');

            const logs = await api.get(`/api/auditoria?entidad=Venta&entidadId=${ventaId}&accion=cancel&limit=5`, authHeaders(adToken));
            expect(logs.data.results[0]?.detalle).toContain(motivo);
            expect(logs.data.results[0]?.detalle).toContain('"antes":{"estadoEntrega":"pendiente"}');
        });

        test('avanzar la entrega sigue sin pedir motivo', async () => {
            const ventaId = await nuevaVenta();
            const res = await api.patch(`/api/ventas/${ventaId}/estado-entrega`, { estadoEntrega: 'autorizada' }, authHeaders(adToken));
            expect(res.status).toBe(200);
            expect((await anularVenta(ventaId, adToken)).status).toBe(204);
        });
    });
});
