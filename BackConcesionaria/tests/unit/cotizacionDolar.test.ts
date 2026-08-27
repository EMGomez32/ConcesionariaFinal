import { convertirMonto } from '../../src/infrastructure/cotizacion/dolarBlue';
import { sugerir, UnidadCandidata } from '../../src/domain/services/sugerenciasVehiculo';

// Unit test PURO (sin red): la conversión por cotización es lo que deja competir a
// un auto en dólares contra un presupuesto en pesos (y viceversa). Sólo se prueba
// la matemática y los bordes; el fetch cacheado (getDolarBlue) pega a una API
// externa y no se testea acá para no atarlo a la red.
//   npx jest tests/unit/cotizacionDolar.test.ts

describe('convertirMonto (dólar blue)', () => {
    const BLUE = 1555; // venta

    it('USD → ARS multiplica por la venta', () => {
        expect(convertirMonto(20000, 'USD', 'ARS', BLUE)).toBe(20000 * 1555);
    });

    it('ARS → USD divide por la venta', () => {
        expect(convertirMonto(31_100_000, 'ARS', 'USD', BLUE)).toBe(31_100_000 / 1555);
    });

    it('misma moneda no toca el monto', () => {
        expect(convertirMonto(500, 'ARS', 'ARS', BLUE)).toBe(500);
        expect(convertirMonto(500, 'USD', 'USD', BLUE)).toBe(500);
    });

    it('ida y vuelta reconstruye el original', () => {
        const enPesos = convertirMonto(20000, 'USD', 'ARS', BLUE)!;
        expect(convertirMonto(enPesos, 'ARS', 'USD', BLUE)).toBeCloseTo(20000, 6);
    });

    it('pares no soportados devuelven null (no se inventa cotización)', () => {
        expect(convertirMonto(100, 'USD', 'EUR', BLUE)).toBeNull();
        expect(convertirMonto(100, 'BRL', 'ARS', BLUE)).toBeNull();
    });

    it('cotización o monto inválidos devuelven null', () => {
        expect(convertirMonto(100, 'USD', 'ARS', 0)).toBeNull();
        expect(convertirMonto(100, 'USD', 'ARS', -1)).toBeNull();
        expect(convertirMonto(Number.NaN, 'USD', 'ARS', BLUE)).toBeNull();
        expect(convertirMonto(100, 'USD', 'ARS', Number.NaN)).toBeNull();
    });
});

// Composición: reproduce EXACTAMENTE lo que hace buscarUnidades en modo
// presupuesto —convertir el stock de otra moneda a la del presupuesto y forzar la
// comparación en esa moneda— para dejar clavado que un auto en dólares SÍ compite
// contra un presupuesto en pesos, y que sin cotización NO (degradación).
describe('un presupuesto en pesos ve los autos en dólares (vía conversión + motor)', () => {
    const BLUE = 1555;
    const cand = (p: Partial<UnidadCandidata> & { id: number }): UnidadCandidata => ({
        marca: 'Toyota', modelo: 'Corolla', moneda: 'ARS', estado: 'publicado', ...p,
    });
    // Presupuesto: ARS 25M–35M.
    const PESOS_1 = cand({ id: 1, modelo: 'Cronos', precio: 24_000_000, moneda: 'ARS' });
    // USD 20.000 → al blue son ARS 31,1M: cae DENTRO del rango en pesos.
    const DOLARES = cand({ id: 2, modelo: 'Corolla', precio: 20_000, moneda: 'USD' });

    // Espeja el paso 4b de buscarUnidades: convertir a la moneda del presupuesto.
    const normalizar = (stock: UnidadCandidata[], monedaPresupuesto: string, blue: number) =>
        stock.map((u) => {
            if (u.precio == null || u.moneda === monedaPresupuesto) return u;
            const nuevo = convertirMonto(u.precio, u.moneda, monedaPresupuesto, blue);
            return nuevo == null ? u : { ...u, precio: nuevo, moneda: monedaPresupuesto };
        });

    it('con cotización, el auto en USD aparece entre las alternativas', () => {
        const stock = normalizar([PESOS_1, DOLARES], 'ARS', BLUE);
        const r = sugerir(
            { modo: 'presupuesto', presupuestoMin: 25_000_000, presupuestoMax: 35_000_000, moneda: 'ARS', monedaPresupuesto: 'ARS' },
            stock,
        );
        const idsResultado = [r.exacta?.id, ...r.alternativas.map((a) => a.unidad.id)].filter(Boolean);
        expect(idsResultado).toContain(DOLARES.id);
    });

    it('sin cotización (stock sin convertir), el auto en USD queda afuera', () => {
        const r = sugerir(
            { modo: 'presupuesto', presupuestoMin: 25_000_000, presupuestoMax: 35_000_000, moneda: 'ARS', monedaPresupuesto: 'ARS' },
            [PESOS_1, DOLARES],
        );
        const idsResultado = [r.exacta?.id, ...r.alternativas.map((a) => a.unidad.id)].filter(Boolean);
        expect(idsResultado).not.toContain(DOLARES.id);
    });
});
