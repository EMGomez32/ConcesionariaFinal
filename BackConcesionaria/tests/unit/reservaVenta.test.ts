import { debeLiberarVehiculo, resolverReservasParaVenta, hoyEnArgentina, reservaYaVencio, problemaDeCambioDeReserva } from '../../src/domain/services/reservaVenta';

// Unit tests PUROS (sin DB): reglas entre reserva, venta y estado del vehículo.
const base = { vehiculoId: 10, clienteId: 1 };

describe('resolverReservasParaVenta', () => {
    test('auto disponible, sin reservas: no consume ni cancela nada', () => {
        expect(resolverReservasParaVenta({ ...base, estadoVehiculo: 'publicado', reservasActivas: [] }))
            .toEqual({ consumir: null, cancelar: [] });
    });

    test('auto reservado por el MISMO cliente que compra: consume su reserva sola', () => {
        const plan = resolverReservasParaVenta({
            ...base, estadoVehiculo: 'reservado', reservasActivas: [{ id: 7, clienteId: 1 }],
        });
        expect(plan).toEqual({ consumir: 7, cancelar: [] });
    });

    test('auto reservado para OTRO cliente y venta sin reservaId → 409 VEHICULO_RESERVADO', () => {
        expect(() => resolverReservasParaVenta({
            ...base, estadoVehiculo: 'reservado', reservasActivas: [{ id: 7, clienteId: 99 }],
        })).toThrow(expect.objectContaining({ statusCode: 409, errorCode: 'VEHICULO_RESERVADO' }));
    });

    test('auto "reservado" sin ninguna reserva activa (estado inconsistente): se puede vender', () => {
        expect(resolverReservasParaVenta({ ...base, estadoVehiculo: 'reservado', reservasActivas: [] }))
            .toEqual({ consumir: null, cancelar: [] });
    });

    describe('con reservaId', () => {
        const ok = { id: 7, vehiculoId: 10, estado: 'activa' };

        test('reserva válida de ese auto: se consume', () => {
            const plan = resolverReservasParaVenta({
                ...base, estadoVehiculo: 'reservado', reservaId: 7, reservaSolicitada: ok,
                reservasActivas: [{ id: 7, clienteId: 55 }],
            });
            expect(plan).toEqual({ consumir: 7, cancelar: [] });
        });

        test('el que compra puede ser otro cliente si se elige la reserva explícitamente', () => {
            const plan = resolverReservasParaVenta({
                ...base, estadoVehiculo: 'reservado', reservaId: 7, reservaSolicitada: ok,
                reservasActivas: [{ id: 7, clienteId: 55 }],
            });
            expect(plan.consumir).toBe(7);
        });

        test('las OTRAS reservas activas del auto se cancelan (ya no se pueden honrar)', () => {
            const plan = resolverReservasParaVenta({
                ...base, estadoVehiculo: 'reservado', reservaId: 7, reservaSolicitada: ok,
                reservasActivas: [{ id: 7, clienteId: 1 }, { id: 8, clienteId: 2 }],
            });
            expect(plan).toEqual({ consumir: 7, cancelar: [8] });
        });

        test('reserva inexistente → 400 RESERVA_INVALIDA', () => {
            expect(() => resolverReservasParaVenta({
                ...base, estadoVehiculo: 'reservado', reservaId: 7, reservaSolicitada: null, reservasActivas: [],
            })).toThrow(expect.objectContaining({ statusCode: 400, errorCode: 'RESERVA_INVALIDA' }));
        });

        test('reserva de OTRO vehículo → 400 (antes se "convertía" una reserva ajena al auto)', () => {
            expect(() => resolverReservasParaVenta({
                ...base, estadoVehiculo: 'publicado', reservaId: 7,
                reservaSolicitada: { id: 7, vehiculoId: 999, estado: 'activa' }, reservasActivas: [],
            })).toThrow(expect.objectContaining({ errorCode: 'RESERVA_INVALIDA' }));
        });

        test.each(['cancelada', 'vencida', 'convertida_en_venta'])('reserva %s → 400', (estado) => {
            expect(() => resolverReservasParaVenta({
                ...base, estadoVehiculo: 'publicado', reservaId: 7,
                reservaSolicitada: { id: 7, vehiculoId: 10, estado }, reservasActivas: [],
            })).toThrow(expect.objectContaining({ errorCode: 'RESERVA_INVALIDA' }));
        });
    });
});

describe('debeLiberarVehiculo', () => {
    test('reservado y sin otras reservas activas → se libera', () => {
        expect(debeLiberarVehiculo('reservado', 0)).toBe(true);
    });

    test('reservado pero queda OTRA reserva activa → no se libera', () => {
        expect(debeLiberarVehiculo('reservado', 1)).toBe(false);
    });

    test.each(['vendido', 'publicado', 'preparacion', 'devuelto', undefined])(
        'auto %s NO se pisa a "publicado" (antes un auto vendido volvía a ofrecerse)',
        (estado) => {
            expect(debeLiberarVehiculo(estado as string | undefined, 0)).toBe(false);
        },
    );
});

describe('hoyEnArgentina / reservaYaVencio', () => {
    test('a las 22 h de Buenos Aires (01 h UTC del día siguiente) sigue siendo "hoy" en Argentina', () => {
        expect(hoyEnArgentina(new Date('2026-11-04T01:00:00Z'))).toBe('2026-11-03');
    });

    test('vence EL día del vencimiento: recién al día siguiente está vencida', () => {
        expect(reservaYaVencio(new Date('2026-11-03T00:00:00Z'), '2026-11-03')).toBe(false);
        expect(reservaYaVencio(new Date('2026-11-03T00:00:00Z'), '2026-11-04')).toBe(true);
        expect(reservaYaVencio('2026-11-02', '2026-11-03')).toBe(true);
    });

    test('sin vencimiento nunca vence', () => {
        expect(reservaYaVencio(null, '2099-01-01')).toBe(false);
    });
});

describe('problemaDeCambioDeReserva (PROC-33: qué campo puede tocar cada rol)', () => {
    const hoy = '2026-11-03';
    const actual: { estado: string; montoSenia: number | null; venceEl: string | null } = { estado: 'activa', montoSenia: 1000, venceEl: '2026-12-31' };
    const vendedor = (cambios: Parameters<typeof problemaDeCambioDeReserva>[0]['cambios'], a = actual) =>
        problemaDeCambioDeReserva({ esAdmin: false, hoy, actual: a, cambios });
    const admin = (cambios: Parameters<typeof problemaDeCambioDeReserva>[0]['cambios'], a = actual) =>
        problemaDeCambioDeReserva({ esAdmin: true, hoy, actual: a, cambios });

    test('el vendedor no cancela; el admin sí', () => {
        expect(vendedor({ estado: 'cancelada' })).toEqual(expect.objectContaining({ status: 403 }));
        expect(admin({ estado: 'cancelada' })).toBeNull();
    });

    test('el vendedor no cambia el monto; reenviar el MISMO monto no es un cambio', () => {
        expect(vendedor({ monto: 500 })).toEqual(expect.objectContaining({ status: 403 }));
        expect(vendedor({ monto: 1000 })).toBeNull();
        expect(admin({ monto: 500 })).toBeNull();
    });

    test('nadie marca vencida una seña que todavía no venció', () => {
        expect(vendedor({ estado: 'vencida' })).toEqual(expect.objectContaining({ status: 422, code: 'RESERVA_NO_VENCIDA' }));
        expect(admin({ estado: 'vencida' })).toEqual(expect.objectContaining({ status: 422 }));
        expect(admin({ estado: 'vencida' })?.message).toContain('31/12/2026');
    });

    test('una seña ya vencida la marca cualquiera', () => {
        expect(vendedor({ estado: 'vencida' }, { ...actual, venceEl: '2026-11-01' })).toBeNull();
    });

    test('una seña sin vencimiento no se puede marcar vencida', () => {
        expect(admin({ estado: 'vencida' }, { ...actual, venceEl: null })?.message).toMatch(/no tiene fecha de vencimiento/);
    });

    test('el vendedor extiende el vencimiento pero no lo mueve a una fecha pasada', () => {
        expect(vendedor({ fechaVencimiento: '2027-01-15' })).toBeNull();
        expect(vendedor({ fechaVencimiento: hoy })).toBeNull();
        expect(vendedor({ fechaVencimiento: '2026-11-02' })).toEqual(expect.objectContaining({ status: 403 }));
        expect(admin({ fechaVencimiento: '2026-11-02' })).toBeNull();
    });

    test('observaciones y re-envíos del estado actual no piden nada', () => {
        expect(vendedor({ estado: 'activa' })).toBeNull();
        expect(vendedor({})).toBeNull();
    });
});
