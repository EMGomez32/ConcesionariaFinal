import { describe, it, expect } from 'vitest';
import { descripcionVehiculo, estadoVehiculoLabel, formatKm, diasEnStock } from './vehiculoTextos';

describe('formatKm', () => {
    it('usa separador de miles es-AR y "km" en minúscula', () => {
        expect(formatKm(61000)).toBe('61.000 km');
        expect(formatKm(0)).toBe('0 km');
    });

    it('sin dato: un 0 km se muestra "0 km" y un usado no muestra nada', () => {
        expect(formatKm(undefined, 'CERO_KM')).toBe('0 km');
        expect(formatKm(null, 'USADO')).toBeNull();
    });
});

describe('descripcionVehiculo', () => {
    it('no deja un guion colgando cuando falta la versión', () => {
        expect(descripcionVehiculo({ dominio: 'AB123CD', version: undefined })).toBe('AB123CD');
        expect(descripcionVehiculo({ dominio: 'AB123CD', version: '' })).toBe('AB123CD');
        expect(descripcionVehiculo({ dominio: 'AB123CD', version: 'XEI 2.0' })).toBe('AB123CD · XEI 2.0');
    });

    it('sin dominio lo dice en palabras', () => {
        expect(descripcionVehiculo({ dominio: '', version: 'Feline' })).toBe('Sin dominio · Feline');
    });
});

describe('estadoVehiculoLabel / diasEnStock', () => {
    it('los estados nunca salen crudos', () => {
        expect(estadoVehiculoLabel('preparacion')).toBe('En preparación');
        expect(estadoVehiculoLabel(undefined)).toBe('Sin estado');
    });

    it('cuenta días desde el ingreso y nunca da negativo', () => {
        const ahora = new Date('2026-11-03T12:00:00Z').getTime();
        expect(diasEnStock('2026-10-24', ahora)).toBe(10);
        expect(diasEnStock('2026-12-01', ahora)).toBe(0);
        expect(diasEnStock('no es fecha', ahora)).toBe(0);
    });
});
