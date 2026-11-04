import { api, loginAsSuperAdmin, authHeaders, unique } from './helpers';

/**
 * El historial de precios de lista guarda el motivo del cambio (pestaña Precios de
 * la ficha). Antes el PATCH no lo aceptaba (Zod lo descartaba) y UpdateVehiculo no
 * lo pasaba, así que la columna motivo quedaba siempre vacía aunque la página
 * /capacitacion lo prometía.
 */
describe('Motivo del cambio de precio de lista', () => {
    let token: string;
    let vehId: number;

    beforeAll(async () => {
        const sa = await loginAsSuperAdmin();
        token = sa.token;
        vehId = (await api.post('/api/vehiculos', {
            marca: unique('M'), modelo: 'Precio', anio: 2021, concesionariaId: sa.user.concesionariaId,
            sucursalId: 1, fechaIngreso: '2026-04-20', tipo: 'USADO',
            precioCompra: 5000, precioLista: 6000, estado: 'publicado', origen: 'compra',
        }, authHeaders(token))).data.id;
    });

    afterAll(async () => {
        await api.delete(`/api/vehiculos/${vehId}`, authHeaders(token));
    });

    const historial = async () =>
        (await api.get(`/api/vehiculo-precios/vehiculo/${vehId}`, authHeaders(token))).data as Array<{
            precioNuevo: string | number; motivo: string | null;
        }>;

    test('PATCH con precio nuevo y motivo lo guarda en el historial', async () => {
        const res = await api.patch(`/api/vehiculos/${vehId}`, {
            precioLista: 5800, motivoCambioPrecio: '  Más de 60 días en stock  ',
        }, authHeaders(token));
        expect(res.status).toBe(200);
        // El motivo no es columna del vehículo: no tiene que aparecer en la respuesta.
        expect(res.data.motivoCambioPrecio).toBeUndefined();

        const h = await historial();
        const fila = h.find((x) => Number(x.precioNuevo) === 5800);
        expect(fila?.motivo).toBe('Más de 60 días en stock');
    });

    test('Sin cambio de precio, el motivo no genera una fila nueva', async () => {
        const antes = (await historial()).length;
        const res = await api.patch(`/api/vehiculos/${vehId}`, {
            precioLista: 5800, motivoCambioPrecio: 'No debería registrarse',
        }, authHeaders(token));
        expect(res.status).toBe(200);
        expect((await historial()).length).toBe(antes);
    });

    test('El detalle devuelve tipo y origen (el formulario de edición los necesita)', async () => {
        // Sin esto el form abría con "Tipo" (obligatorio) vacío y no dejaba guardar.
        const res = await api.get(`/api/vehiculos/${vehId}`, authHeaders(token));
        expect(res.status).toBe(200);
        expect(res.data.tipo).toBe('USADO');
        expect(res.data.origen).toBe('compra');
    });

    test('Reenviar el detalle tal cual (lo que hace el form de edición) no da 400', async () => {
        // El form hace GET + reset(data) y manda la entidad entera: los campos vacíos
        // vuelven como null (version, vin, fechaCompra, vencimientos...).
        const det = (await api.get(`/api/vehiculos/${vehId}`, authHeaders(token))).data;
        expect(det.vin).toBeNull();
        const res = await api.patch(`/api/vehiculos/${vehId}`, { ...det, color: 'Gris' }, authHeaders(token));
        expect(res.status).toBe(200);
        expect(res.data.color).toBe('Gris');
    });

    test('Subir el precio sin motivo queda con motivo vacío', async () => {
        await api.patch(`/api/vehiculos/${vehId}`, { precioLista: 5900 }, authHeaders(token));
        const fila = (await historial()).find((x) => Number(x.precioNuevo) === 5900);
        expect(fila?.motivo ?? null).toBeNull();
    });

    test('Bajar el precio sin motivo se rechaza (PROC-34): 400 en el campo del motivo', async () => {
        const res = await api.patch(`/api/vehiculos/${vehId}`, { precioLista: 5700 }, authHeaders(token));
        expect(res.status).toBe(400);
        expect(res.data.details).toEqual([expect.objectContaining({ campo: 'motivoCambioPrecio' })]);
        expect((await historial()).find((x) => Number(x.precioNuevo) === 5700)).toBeUndefined();
    });
});
