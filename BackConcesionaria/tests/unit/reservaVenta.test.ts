import { debeLiberarVehiculo, resolverReservasParaVenta } from '../../src/domain/services/reservaVenta';

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
