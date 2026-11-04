import { api, loginAsAdmin, authHeaders } from './helpers';

/**
 * Mensajes de validación (400 VALIDATION_ERROR): en español, con la etiqueta
 * legible del campo y concordancia de género, sin nombres internos en el
 * `message` ("sucursalId: …") ni restos de Zod en inglés. La forma de la
 * respuesta no cambia: `error`, `message` y `details: [{ campo, mensaje }]`.
 */
describe('Mensajes de validación en español', () => {
    let token: string;

    beforeAll(async () => {
        token = (await loginAsAdmin()).token;
    });

    const sinNombresInternos = (message: string) => {
        // Ni "campo: mensaje" ni camelCase suelto (sucursalId, fechaVencimiento…).
        expect(message).not.toMatch(/\b[a-z]+[A-Z][A-Za-z]*\b/);
        expect(message).not.toMatch(/Invalid|Required|expected|received/);
    };

    test('alta de reserva vacía: etiquetas legibles y género concordado', async () => {
        const r = await api.post('/api/reservas', {}, authHeaders(token));
        expect(r.status).toBe(400);
        expect(r.data.error).toBe('VALIDATION_ERROR');
        expect(r.data.message).toContain('La sucursal es obligatoria');
        expect(r.data.message).toContain('El vehículo es obligatorio');
        expect(r.data.message).toContain('La fecha de vencimiento es obligatoria');
        expect(r.data.message).not.toContain('La sucursal es obligatorio');
        sinNombresInternos(r.data.message);

        // details sigue con el path técnico para que el front marque el input.
        expect(r.data.details).toEqual(expect.arrayContaining([
            { campo: 'sucursalId', mensaje: 'La sucursal es obligatoria' },
        ]));
    });

    test('un enum fuera de catálogo dice qué opciones hay, en español', async () => {
        const r = await api.post('/api/reservas', { moneda: 'EUR' }, authHeaders(token));
        expect(r.status).toBe(400);
        expect(r.data.details).toEqual(expect.arrayContaining([
            { campo: 'moneda', mensaje: 'Elegí una moneda válida: ARS o USD' },
        ]));
        sinNombresInternos(r.data.message);
    });

    test('enum sin mensaje propio: el mapa de errores arma uno legible', async () => {
        const r = await api.patch('/api/reservas/999999', { estado: 'inexistente' }, authHeaders(token));
        expect(r.status).toBe(400);
        expect(r.data.message).toBe('Elegí un estado válido: activa, convertida en venta, cancelada o vencida');
    });

    test('el mismo error en varios ítems se muestra una vez en el message', async () => {
        const r = await api.post('/api/presupuestos', {
            sucursalId: 1, clienteId: 1, vendedorId: 2, fechaCreacion: '2026-11-03',
            items: [{ precioLista: 1, precioFinal: 1 }, { precioLista: 2, precioFinal: 2 }],
        }, authHeaders(token));
        expect(r.status).toBe(400);
        expect(r.data.message).toBe('El vehículo del ítem es obligatorio');
        expect(r.data.details.map((d: { campo: string }) => d.campo)).toEqual(['items.0.vehiculoId', 'items.1.vehiculoId']);
    });

    test('tipos y rangos sin mensaje propio salen en español', async () => {
        const r = await api.post('/api/financiaciones', {
            ventaId: 1, clienteId: 1, fechaInicio: '2026-11-03', montoFinanciado: 1000,
            cuotas: 3, diaVencimiento: 10, tasaMensual: 'mucho',
        }, authHeaders(token));
        expect(r.status).toBe(400);
        expect(r.data.message).toBe('La tasa mensual tiene que ser un número');
    });
});
