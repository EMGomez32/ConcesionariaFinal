import {
    sugerir,
    estaDisponible,
    esPeorEnTodosLosEjes,
    calcularPresupuestoReal,
    describirEstado,
    normalizarTexto,
    formatearPrecio,
    MAX_ALTERNATIVAS,
    UMBRAL_SOBRE_MAXIMO,
    DIAS_STOCK_PARA_ROTACION,
    UnidadCandidata,
} from '../../src/domain/services/sugerenciasVehiculo';

// Unit tests PUROS (sin DB): validan las reglas de BÚSQUEDA Y SUGERENCIAS del
// encargo. Corren standalone con `npx jest tests/unit`, sin stack docker: el
// módulo bajo prueba no importa prisma ni env a propósito.
//
// El stock de ejemplo es un usado argentino verosímil (precios en ARS de 2026).

const u = (p: Partial<UnidadCandidata> & { id: number }): UnidadCandidata => ({
    marca: 'Toyota',
    modelo: 'Corolla',
    moneda: 'ARS',
    estado: 'publicado',
    ...p,
});

// --- Stock base: todo publicado, mismo mercado ------------------------------
const COROLLA_XEI_19 = u({ id: 1, modelo: 'Corolla', version: 'XEI', anio: 2019, km: 78000, precio: 28500000 });
const COROLLA_XEI_21 = u({ id: 2, modelo: 'Corolla', version: 'XEI', anio: 2021, km: 42000, precio: 30780000 });
const COROLLA_SEG_20 = u({ id: 3, modelo: 'Corolla', version: 'SEG', anio: 2020, km: 55000, precio: 32000000 });
const VENTO_19 = u({ id: 4, marca: 'Volkswagen', modelo: 'Vento', version: 'Highline', anio: 2019, km: 82000, precio: 27500000 });
const CRUZE_20 = u({ id: 5, marca: 'Chevrolet', modelo: 'Cruze', version: 'LT', anio: 2020, km: 61000, precio: 29800000 });
const FOCUS_18 = u({ id: 6, marca: 'Ford', modelo: 'Focus', version: 'SE', anio: 2018, km: 95000, precio: 24000000 });
const P208_21 = u({ id: 7, marca: 'Peugeot', modelo: '208', version: 'Allure', anio: 2021, km: 38000, precio: 22500000 });
const CRONOS_22 = u({ id: 8, marca: 'Fiat', modelo: 'Cronos', version: 'Drive', anio: 2022, km: 29000, precio: 23900000 });
const ETIOS_18 = u({ id: 9, modelo: 'Etios', version: 'XLS', anio: 2018, km: 91000, precio: 17800000 });
const HILUX_21 = u({ id: 10, modelo: 'Hilux', version: 'SRV', anio: 2021, km: 88000, precio: 58000000 });
// Misma marca, otro modelo, +28%: el único "modelo equivalente" de verdad a una
// Corolla en este stock (el Etios está 38% abajo y la Hilux 104% arriba).
const COROLLA_CROSS_21 = u({ id: 11, modelo: 'Corolla Cross', version: 'XEI', anio: 2021, km: 45000, precio: 36500000 });
// +18% sobre la Corolla XEI 2019: fuera de la banda ±15%, pero un escalón arriba.
const PASSAT_21 = u({ id: 12, marca: 'Volkswagen', modelo: 'Passat', anio: 2021, km: 40000, precio: 33500000 });

const STOCK = [
    COROLLA_XEI_19, COROLLA_XEI_21, COROLLA_SEG_20, VENTO_19, CRUZE_20,
    FOCUS_18, P208_21, CRONOS_22, ETIOS_18, HILUX_21, COROLLA_CROSS_21,
];

const ids = (r: { alternativas: { unidad: UnidadCandidata }[] }) => r.alternativas.map((a) => a.unidad.id);
const motivos = (r: { alternativas: { motivo: string }[] }) => r.alternativas.map((a) => a.motivo);

// ===========================================================================
describe('filtros duros de disponibilidad', () => {
    it('sólo `publicado` está disponible: vendido, reservado, preparación y devuelto no', () => {
        expect(estaDisponible(u({ id: 1, estado: 'publicado' }))).toBe(true);
        expect(estaDisponible(u({ id: 1, estado: 'vendido' }))).toBe(false);
        expect(estaDisponible(u({ id: 1, estado: 'reservado' }))).toBe(false);
        expect(estaDisponible(u({ id: 1, estado: 'preparacion' }))).toBe(false);
        expect(estaDisponible(u({ id: 1, estado: 'devuelto' }))).toBe(false);
    });

    it('en tránsito: disponible SÓLO con fecha de ingreso confirmada', () => {
        expect(estaDisponible(u({ id: 1, estado: 'transito' }))).toBe(false);
        expect(estaDisponible(u({ id: 1, estado: 'transito', fechaIngresoConfirmada: false }))).toBe(false);
        expect(estaDisponible(u({ id: 1, estado: 'transito', fechaIngresoConfirmada: true }))).toBe(true);
    });

    it('un estado desconocido NO se ofrece (lista blanca, default-deny)', () => {
        expect(estaDisponible(u({ id: 1, estado: 'estado_nuevo_del_futuro' }))).toBe(false);
    });

    it('CA-4: ninguna alternativa sugerida corresponde a una unidad no disponible', () => {
        // Las cuatro no disponibles CALIFICARÍAN por criterio (mismo modelo,
        // banda de precio, misma marca): quedan afuera sólo por su estado.
        const stock = [
            { ...COROLLA_XEI_21, estado: 'vendido' },
            { ...COROLLA_SEG_20, estado: 'reservado' },
            { ...VENTO_19, estado: 'preparacion' },
            { ...COROLLA_CROSS_21, estado: 'devuelto' },
            CRUZE_20, // el único publicado
        ];
        const r = sugerir({ modo: 'unidad', unidadBuscada: COROLLA_XEI_19 }, stock);
        expect(ids(r)).toEqual([CRUZE_20.id]);
        r.alternativas.forEach((a) => expect(a.unidad.estado).toBe('publicado'));
    });

    it('una unidad sin precio de lista no se sugiere: no se puede decir cuánto sale', () => {
        const sinPrecio = u({ id: 99, marca: 'Ford', modelo: 'Ka', anio: 2020, km: 50000, precio: null });
        const r = sugerir({ modo: 'unidad', unidadBuscada: COROLLA_XEI_19 }, [sinPrecio]);
        expect(r.alternativas).toHaveLength(0);
    });

    it('no mezcla monedas: un usado en USD no compite contra uno en ARS', () => {
        const enDolares = u({ id: 50, marca: 'Honda', modelo: 'Civic', anio: 2020, km: 60000, precio: 21000, moneda: 'USD' });
        const r = sugerir({ modo: 'unidad', unidadBuscada: COROLLA_XEI_19 }, [...STOCK, enDolares]);
        expect(ids(r)).not.toContain(enDolares.id);
    });
});

// ===========================================================================
describe('modo UNIDAD (patente / N° de stock / VIN)', () => {
    it('CA-3: devuelve la exacta disponible MÁS exactamente 3 alternativas', () => {
        const r = sugerir({ modo: 'unidad', unidadBuscada: COROLLA_XEI_19 }, STOCK);
        expect(r.exacta?.id).toBe(COROLLA_XEI_19.id);
        expect(r.estadoDeLaExacta).toBeUndefined();
        expect(r.alternativas).toHaveLength(MAX_ALTERNATIVAS);
        expect(r.aviso).toBeUndefined();
    });

    it('no se sugiere a sí misma', () => {
        const r = sugerir({ modo: 'unidad', unidadBuscada: COROLLA_XEI_19 }, STOCK);
        expect(ids(r)).not.toContain(COROLLA_XEI_19.id);
    });

    it('aplica los TRES criterios: mismo modelo, precio ±15%, misma marca otro modelo', () => {
        const r = sugerir({ modo: 'unidad', unidadBuscada: COROLLA_XEI_19 }, STOCK);
        const ms = motivos(r);
        expect(ms.some((m) => m.startsWith('mismo modelo, otra unidad'))).toBe(true);
        expect(ms.some((m) => m.startsWith('rango de precio similar (±15%)'))).toBe(true);
        expect(ms.some((m) => m.startsWith('misma marca, modelo equivalente'))).toBe(true);
    });

    it('CA-5: el motivo es concreto y legible en voz alta', () => {
        const r = sugerir({ modo: 'unidad', unidadBuscada: COROLLA_XEI_19 }, [COROLLA_XEI_21]);
        expect(r.alternativas[0].motivo).toBe(
            'mismo modelo, otra unidad, 2 años más nuevo, 36.000 km menos, +8% de precio',
        );
    });

    it('si la buscada NO está disponible informa su estado y las alternativas son la respuesta', () => {
        const vendida = { ...COROLLA_XEI_19, estado: 'vendido' };
        const r = sugerir({ modo: 'unidad', unidadBuscada: vendida }, STOCK);
        expect(r.exacta).toBeUndefined();
        expect(r.estadoDeLaExacta).toBe('ya está vendida');
        expect(r.alternativas).toHaveLength(MAX_ALTERNATIVAS);
    });

    it('describirEstado habla claro para cada estado', () => {
        expect(describirEstado(u({ id: 1, estado: 'reservado' }))).toBe('está reservada / señada');
        expect(describirEstado(u({ id: 1, estado: 'preparacion' }))).toBe('está en preparación (taller)');
        expect(describirEstado(u({ id: 1, estado: 'transito' }))).toBe(
            'está en tránsito, sin fecha de ingreso confirmada',
        );
    });

    it('"modelo equivalente" tiene tope de precio: un Etios no es equivalente a un Corolla', () => {
        // -38%: misma marca, pero otra categoría de auto. Ofrecerlo es quedar mal.
        const r = sugerir({ modo: 'unidad', unidadBuscada: COROLLA_XEI_19 }, [ETIOS_18]);
        expect(r.alternativas).toHaveLength(0);
        // El Corolla Cross (+28%) sí entra como modelo equivalente.
        const conCross = sugerir({ modo: 'unidad', unidadBuscada: COROLLA_XEI_19 }, [COROLLA_CROSS_21]);
        expect(ids(conCross)).toEqual([COROLLA_CROSS_21.id]);
        expect(conCross.alternativas[0].motivo).toContain('misma marca, modelo equivalente: Corolla Cross');
    });

    it('usa el segmento cuando está cargado y lo nombra en el motivo', () => {
        const buscada = { ...COROLLA_XEI_19, segmento: 'sedán mediano' };
        const mismoSegmento = { ...CRUZE_20, segmento: 'sedán mediano' };
        const otroSegmento = { ...VENTO_19, segmento: 'hatchback' };
        const r = sugerir({ modo: 'unidad', unidadBuscada: buscada }, [mismoSegmento, otroSegmento]);
        expect(ids(r)).toEqual([mismoSegmento.id]);
        expect(r.alternativas[0].motivo).toContain('mismo segmento (sedán mediano)');
    });
});

// ===========================================================================
describe('modo MODELO (marca / modelo / versión / año)', () => {
    it('la exacta es la mejor unidad disponible del modelo buscado', () => {
        const r = sugerir({ modo: 'modelo', marca: 'Toyota', modelo: 'Corolla' }, STOCK);
        // Entre las tres Corolla, la 2021 con 42.000 km es la de mejor relación año/km.
        expect(r.exacta?.id).toBe(COROLLA_XEI_21.id);
    });

    it('normaliza marca y modelo: acentos y mayúsculas no rompen el match', () => {
        expect(normalizarTexto('  Volkswagen  ')).toBe('volkswagen');
        expect(normalizarTexto('Citroën')).toBe('citroen');
        const r = sugerir({ modo: 'modelo', marca: 'TOYOTA', modelo: 'corolla' }, STOCK);
        expect(r.exacta?.id).toBe(COROLLA_XEI_21.id);
    });

    it('criterio 1: otras versiones o años del mismo modelo', () => {
        const r = sugerir({ modo: 'modelo', marca: 'Toyota', modelo: 'Corolla' }, STOCK);
        const delModelo = r.alternativas.filter((a) => a.motivo.startsWith('mismo modelo'));
        expect(delModelo.length).toBeGreaterThan(0);
        expect(delModelo[0].motivo).toContain('mismo modelo, ');
    });

    it('criterio 2: competencia directa del segmento a precio similar', () => {
        const r = sugerir({ modo: 'modelo', marca: 'Toyota', modelo: 'Corolla' }, STOCK);
        expect(motivos(r).some((m) => m.startsWith('competencia directa de Toyota Corolla:'))).toBe(true);
    });

    it('criterio 3: el upsell aparece si ENTRA en el presupuesto', () => {
        // Referencia Corolla XEI 2019 ($28.5M); el Passat ($33.5M, +18%) queda
        // fuera de la banda ±15% pero es un escalón arriba que entra en el techo.
        const stock = [COROLLA_XEI_19, PASSAT_21];
        const r = sugerir(
            { modo: 'modelo', marca: 'Toyota', modelo: 'Corolla', anio: 2019, presupuestoMax: 36000000 },
            stock,
        );
        const upsell = r.alternativas.find((a) => a.motivo.startsWith('un escalón arriba'));
        expect(upsell?.unidad.id).toBe(PASSAT_21.id);
        expect(upsell?.motivo).toBe(
            'un escalón arriba y entra en el presupuesto: Volkswagen Passat 2021, +18% de precio, dentro de tu máximo de $36.000.000',
        );
    });

    it('el upsell que NO entra en el presupuesto no se ofrece', () => {
        const r = sugerir(
            { modo: 'modelo', marca: 'Toyota', modelo: 'Corolla', anio: 2019, presupuestoMax: 32000000 },
            [COROLLA_XEI_19, PASSAT_21],
        );
        expect(r.alternativas).toHaveLength(0);
    });

    it('un escalón es un escalón, no un salto: la Hilux al +104% no es upsell aunque el techo la banque', () => {
        const r = sugerir(
            { modo: 'modelo', marca: 'Toyota', modelo: 'Corolla', anio: 2019, presupuestoMax: 60000000 },
            [COROLLA_XEI_19, HILUX_21],
        );
        expect(r.alternativas).toHaveLength(0);
        expect(r.aviso).toBe('No hay alternativas en el stock disponible que cumplan los criterios.');
    });

    it('sin presupuestoMax NO hay upsell: no se puede afirmar que entra', () => {
        const r = sugerir({ modo: 'modelo', marca: 'Toyota', modelo: 'Corolla', anio: 2019 }, STOCK);
        expect(motivos(r).some((m) => m.startsWith('un escalón arriba'))).toBe(false);
    });

    it('si todas las unidades del modelo están tomadas, lo informa con detalle', () => {
        const stock = [
            { ...COROLLA_XEI_21, estado: 'reservado' },
            { ...COROLLA_SEG_20, estado: 'preparacion' },
            CRUZE_20,
        ];
        const r = sugerir({ modo: 'modelo', marca: 'Toyota', modelo: 'Corolla' }, stock);
        expect(r.exacta).toBeUndefined();
        expect(r.estadoDeLaExacta).toBe(
            'Toyota Corolla: 2 unidades en stock, ninguna disponible (reservada / señada, en preparación (taller))',
        );
        expect(ids(r)).toContain(CRUZE_20.id);
    });
});

// ===========================================================================
describe('modo PRESUPUESTO (rango min/max)', () => {
    it('la exacta es la de mejor relación año/km dentro del rango', () => {
        const r = sugerir({ modo: 'presupuesto', presupuestoMin: 20000000, presupuestoMax: 30000000 }, STOCK);
        // Cronos 2022 / 29.000 km es la más nueva y menos usada del rango.
        expect(r.exacta?.id).toBe(CRONOS_22.id);
        expect(r.alternativas).toHaveLength(MAX_ALTERNATIVAS);
    });

    it('marca las que superan el máximo hasta +10% y las explica', () => {
        // Máximo $28.000.000 → el techo duro queda en $30.800.000.
        const r = sugerir({ modo: 'presupuesto', presupuestoMin: 20000000, presupuestoMax: 28000000 }, STOCK);
        const porEncima = r.alternativas.filter((a) => a.porEncimaDelMaximo);
        expect(porEncima.length).toBeGreaterThan(0);
        expect(porEncima[0].unidad.id).toBe(COROLLA_XEI_19.id); // $28.5M, el excedente más chico
        expect(porEncima[0].motivo).toBe(
            'Toyota Corolla XEI 2019 a $28.500.000: $500.000 por encima de tu máximo (+2%)',
        );
    });

    it('lo que pasa el +10% queda afuera, no se muestra ni marcado', () => {
        const r = sugerir({ modo: 'presupuesto', presupuestoMin: 20000000, presupuestoMax: 28000000 }, STOCK);
        // Corolla XEI 2021 ($30.780.000) entra en el +10%; el SEG ($32M) no.
        expect(ids(r).concat(r.exacta ? [r.exacta.id] : [])).not.toContain(COROLLA_SEG_20.id);
        const techo = 28000000 * (1 + UMBRAL_SOBRE_MAXIMO);
        r.alternativas.forEach((a) => expect(a.unidad.precio!).toBeLessThanOrEqual(techo));
    });

    it('no ofrece nada por debajo del mínimo', () => {
        const r = sugerir({ modo: 'presupuesto', presupuestoMin: 25000000, presupuestoMax: 35000000 }, STOCK);
        const todos = ids(r).concat(r.exacta ? [r.exacta.id] : []);
        expect(todos).not.toContain(ETIOS_18.id); // $17.8M
        expect(todos).not.toContain(P208_21.id); // $22.5M
    });

    it('criterio 3: rotación / prioridad de venta, con los días en stock', () => {
        const parada = { ...CRUZE_20, diasEnStock: 187, prioridadVenta: true };
        const r = sugerir(
            { modo: 'presupuesto', presupuestoMin: 20000000, presupuestoMax: 32000000 },
            [CRONOS_22, P208_21, parada],
        );
        const rot = r.alternativas.find((a) => a.motivo.includes('prioridad de venta'));
        expect(rot?.unidad.id).toBe(parada.id);
        expect(rot?.motivo).toContain('lleva 187 días en stock');
    });

    it('el presupuesto real manda: permuta + anticipo, no lo que el cliente dijo', () => {
        expect(calcularPresupuestoReal({ valorPermuta: 14000000, anticipo: 6000000 })).toBe(20000000);
        expect(calcularPresupuestoReal({ valorPermuta: null, anticipo: 8000000 })).toBe(8000000);
        expect(calcularPresupuestoReal({})).toBe(0);

        const real = calcularPresupuestoReal({ valorPermuta: 14000000, anticipo: 4000000 }); // $18M
        const r = sugerir({ modo: 'presupuesto', presupuestoMax: real }, STOCK);
        // Con $18M reales sólo entra el Etios ($17.8M), no el Corolla que pidió.
        expect(r.exacta?.id).toBe(ETIOS_18.id);
    });
});

// ===========================================================================
describe('regla: no sugerir unidades PEORES EN TODOS LOS EJES', () => {
    it('más cara Y más vieja Y con más km queda afuera', () => {
        const buscada = u({ id: 100, marca: 'Ford', modelo: 'Focus', anio: 2020, km: 50000, precio: 25000000 });
        const peorEnTodo = u({ id: 101, marca: 'Ford', modelo: 'Focus', anio: 2017, km: 130000, precio: 27000000 });
        expect(esPeorEnTodosLosEjes(buscada, peorEnTodo)).toBe(true);

        const r = sugerir({ modo: 'unidad', unidadBuscada: buscada }, [peorEnTodo]);
        expect(r.alternativas).toHaveLength(0);
        expect(r.aviso).toBe('No hay alternativas en el stock disponible que cumplan los criterios.');
    });

    it('peor en dos ejes pero mejor en uno SÍ se sugiere', () => {
        const buscada = u({ id: 100, marca: 'Ford', modelo: 'Focus', anio: 2020, km: 50000, precio: 25000000 });
        // Más vieja y con más km, pero MÁS BARATA: es una oferta legítima.
        const masBarata = u({ id: 102, marca: 'Ford', modelo: 'Focus', anio: 2017, km: 130000, precio: 21000000 });
        expect(esPeorEnTodosLosEjes(buscada, masBarata)).toBe(false);
        expect(ids(sugerir({ modo: 'unidad', unidadBuscada: buscada }, [masBarata]))).toEqual([masBarata.id]);
    });

    it('con un eje sin dato no se puede afirmar la dominación: no se descarta en silencio', () => {
        const buscada = u({ id: 100, marca: 'Ford', modelo: 'Focus', anio: 2020, km: 50000, precio: 25000000 });
        const sinKm = u({ id: 103, marca: 'Ford', modelo: 'Focus', anio: 2017, km: null, precio: 27000000 });
        expect(esPeorEnTodosLosEjes(buscada, sinKm)).toBe(false);
        expect(ids(sugerir({ modo: 'unidad', unidadBuscada: buscada }, [sinKm]))).toEqual([sinKm.id]);
    });
});

// ===========================================================================
describe('regla: no repetir lo ya mostrado al cliente', () => {
    // Stock de UNA sola unidad a propósito: contra el stock completo la Corolla
    // XEI 2021 no gana lugar por ranking, así que un `not.toContain` pasaría
    // igual aunque la regla no existiera. Con una sola candidata, la única razón
    // posible para que no aparezca es la regla que se está probando.
    const soloUna = [COROLLA_XEI_21];

    it('CA-8: no repite una unidad mostrada en una atención anterior', () => {
        const control = sugerir({ modo: 'unidad', unidadBuscada: COROLLA_XEI_19 }, soloUna);
        expect(ids(control)).toEqual([COROLLA_XEI_21.id]); // sin historial, sí aparece

        const r = sugerir({ modo: 'unidad', unidadBuscada: COROLLA_XEI_19 }, soloUna, [
            { vehiculoId: COROLLA_XEI_21.id, precioAlMostrar: 30780000 },
        ]);
        expect(r.alternativas).toHaveLength(0);
    });

    it('EXCEPCIÓN: si bajó de precio vuelve, y el motivo dice cuánto bajó', () => {
        const r = sugerir({ modo: 'unidad', unidadBuscada: COROLLA_XEI_19 }, soloUna, [
            { vehiculoId: COROLLA_XEI_21.id, precioAlMostrar: 34200000 },
        ]);
        expect(ids(r)).toEqual([COROLLA_XEI_21.id]);
        expect(r.alternativas[0].motivo).toContain('ya se la mostraste, bajó un 10% desde entonces');
    });

    it('sin precio guardado no se puede probar la baja: no se repite', () => {
        const r = sugerir({ modo: 'unidad', unidadBuscada: COROLLA_XEI_19 }, soloUna, [
            { vehiculoId: COROLLA_XEI_21.id },
        ]);
        expect(r.alternativas).toHaveLength(0);
    });

    it('si subió de precio tampoco vuelve', () => {
        const r = sugerir({ modo: 'unidad', unidadBuscada: COROLLA_XEI_19 }, soloUna, [
            { vehiculoId: COROLLA_XEI_21.id, precioAlMostrar: 28000000 },
        ]);
        expect(r.alternativas).toHaveLength(0);
    });

    it('EXCEPCIÓN: el vendedor puede pedir explícitamente volver a verlas', () => {
        const r = sugerir({ modo: 'unidad', unidadBuscada: COROLLA_XEI_19, incluirYaMostradas: true }, soloUna, [
            { vehiculoId: COROLLA_XEI_21.id, precioAlMostrar: 30780000 },
        ]);
        expect(ids(r)).toEqual([COROLLA_XEI_21.id]);
        expect(r.alternativas[0].motivo).toContain('ya se la mostraste en una visita anterior');
    });
});

// ===========================================================================
describe('regla: nunca rellenar — menos de 3 se avisa', () => {
    it('devuelve 2 con aviso explícito, sin completar con cualquier cosa', () => {
        const r = sugerir({ modo: 'unidad', unidadBuscada: COROLLA_XEI_19 }, [COROLLA_XEI_21, COROLLA_SEG_20]);
        expect(r.alternativas).toHaveLength(2);
        expect(r.aviso).toBe(
            'Sólo hay 2 alternativas que cumplen los criterios; no se completa con unidades que no correspondan.',
        );
    });

    it('con una sola, el aviso va en singular', () => {
        const r = sugerir({ modo: 'unidad', unidadBuscada: COROLLA_XEI_19 }, [COROLLA_XEI_21]);
        expect(r.alternativas).toHaveLength(1);
        expect(r.aviso).toBe(
            'Sólo hay 1 alternativa que cumple los criterios; no se completa con unidades que no correspondan.',
        );
    });

    it('stock vacío: 0 alternativas y aviso, nunca una sugerencia inventada', () => {
        const r = sugerir({ modo: 'unidad', unidadBuscada: COROLLA_XEI_19 }, []);
        expect(r.alternativas).toEqual([]);
        expect(r.aviso).toBe('No hay alternativas en el stock disponible que cumplan los criterios.');
    });

    it('nunca devuelve más de 3, por grande que sea el stock', () => {
        const grande = Array.from({ length: 40 }, (_, i) =>
            u({ id: 500 + i, modelo: 'Corolla', version: 'XEI', anio: 2020, km: 40000 + i * 1000, precio: 28000000 + i * 100000 }),
        );
        const r = sugerir({ modo: 'unidad', unidadBuscada: COROLLA_XEI_19 }, grande);
        expect(r.alternativas).toHaveLength(MAX_ALTERNATIVAS);
        expect(r.aviso).toBeUndefined();
        expect(new Set(ids(r)).size).toBe(MAX_ALTERNATIVAS); // sin repetidas
    });
});

// ===========================================================================
describe('formato de los números que se leen en voz alta', () => {
    it('pesos con puntos de miles, otras monedas con su código', () => {
        expect(formatearPrecio(28500000, 'ARS')).toBe('$28.500.000');
        expect(formatearPrecio(18500, 'USD')).toBe('USD 18.500');
    });
});

// ===========================================================================
/*
 * REGRESIONES DE LA MONEDA.
 *
 * La moneda no es un adorno: es lo que hace que dos números sean comparables.
 * Antes se resolvía DESPUÉS de elegir la exacta y sólo se aplicaba al pool de
 * alternativas, así que el resultado principal y sus alternativas podían salir
 * en unidades de cuenta distintas — y en los modos donde la moneda no la elige
 * el vendedor, una atención que nace en ARS barría el stock entero de una
 * concesionaria que publica los usados en dólares.
 */
describe('moneda: la exacta y las alternativas se comparan en la MISMA', () => {
    const CIVIC_USD = u({ id: 60, marca: 'Honda', modelo: 'Civic', anio: 2023, km: 20000, precio: 18500, moneda: 'USD' });

    it('modo PRESUPUESTO: un usado en dólares NO entra en un rango tipeado en pesos', () => {
        // 18.500 <= 25.000.000 es verdadero por el número pelado, y como es el más
        // nuevo y con menos km ganaba el desempate: salía como "lo que buscaba",
        // con las alternativas en pesos al lado.
        const r = sugerir(
            { modo: 'presupuesto', presupuestoMin: 0, presupuestoMax: 25000000, moneda: 'ARS' },
            [CRONOS_22, P208_21, CIVIC_USD],
        );
        expect(r.exacta?.id).not.toBe(CIVIC_USD.id);
        expect(r.exacta?.moneda).toBe('ARS');
        expect(r.moneda).toBe('ARS');
        expect(ids(r)).not.toContain(CIVIC_USD.id);
    });

    it('modo PRESUPUESTO: sin moneda pedida se infiere la dominante del stock', () => {
        const soloDolares = [
            u({ id: 70, marca: 'Volkswagen', modelo: 'Amarok', anio: 2021, km: 60000, precio: 32000, moneda: 'USD' }),
            u({ id: 71, marca: 'Volkswagen', modelo: 'Amarok', anio: 2020, km: 80000, precio: 29000, moneda: 'USD' }),
        ];
        const r = sugerir({ modo: 'presupuesto', presupuestoMax: 35000 }, soloDolares);
        expect(r.moneda).toBe('USD');
        expect(r.exacta?.id).toBe(70);
    });

    it('modo UNIDAD: la moneda de la unidad buscada MANDA sobre la de la atención', () => {
        // El caso del salón: atención abierta en ARS por default (es el default de
        // la columna) y stock publicado en dólares. Antes devolvía la exacta y CERO
        // alternativas, con el aviso culpando a los criterios de cercanía.
        const amarok = u({ id: 80, marca: 'Volkswagen', modelo: 'Amarok', anio: 2022, km: 40000, precio: 32000, moneda: 'USD' });
        const otras = [
            u({ id: 81, marca: 'Volkswagen', modelo: 'Amarok', anio: 2021, km: 55000, precio: 29500, moneda: 'USD' }),
            u({ id: 82, marca: 'Volkswagen', modelo: 'Amarok', anio: 2020, km: 70000, precio: 27000, moneda: 'USD' }),
        ];
        const r = sugerir({ modo: 'unidad', unidadBuscada: amarok, moneda: 'ARS' }, [amarok, ...otras]);
        expect(r.moneda).toBe('USD');
        expect(r.exacta?.id).toBe(amarok.id);
        expect(ids(r).sort()).toEqual([81, 82]);
    });

    it('modo MODELO: la moneda pedida es preferencia, no un filtro que deje sin respuesta', () => {
        const corollaUsd = u({ id: 90, modelo: 'Corolla', version: 'XEI', anio: 2022, km: 30000, precio: 21000, moneda: 'USD' });
        const r = sugerir({ modo: 'modelo', marca: 'Toyota', modelo: 'Corolla', moneda: 'ARS' }, [corollaUsd]);
        expect(r.exacta?.id).toBe(corollaUsd.id);
        expect(r.moneda).toBe('USD');
    });

    it('modo MODELO: habiendo del modelo en las dos monedas, gana la pedida', () => {
        const corollaUsd = u({ id: 91, modelo: 'Corolla', version: 'XEI', anio: 2023, km: 10000, precio: 24000, moneda: 'USD' });
        const r = sugerir({ modo: 'modelo', marca: 'Toyota', modelo: 'Corolla', moneda: 'ARS' }, [...STOCK, corollaUsd]);
        expect(r.moneda).toBe('ARS');
        expect(r.exacta?.id).toBe(COROLLA_XEI_21.id);
    });

    it('cuando el pool se vacía POR LA MONEDA el aviso lo dice, no culpa a los criterios', () => {
        const r = sugerir(
            { modo: 'presupuesto', presupuestoMax: 40000000, moneda: 'ARS' },
            [CIVIC_USD, u({ id: 61, marca: 'Honda', modelo: 'HRV', anio: 2022, km: 30000, precio: 22000, moneda: 'USD' })],
        );
        expect(r.alternativas).toHaveLength(0);
        expect(r.aviso).toContain('otra moneda');
        expect(r.aviso).not.toBe('No hay alternativas en el stock disponible que cumplan los criterios.');
    });

    it('el rango en otra moneda que la comparación se IGNORA, no se compara a ciegas', () => {
        // Techo relevado en pesos ($20M) y unidad buscada en dólares: "29.500 <=
        // 20.000.000" es verdadero por el número pelado y no significa nada, así
        // que no puede ni filtrar ni marcar.
        const amarok = u({ id: 83, marca: 'Volkswagen', modelo: 'Amarok', anio: 2022, km: 40000, precio: 32000, moneda: 'USD' });
        const otra = u({ id: 84, marca: 'Volkswagen', modelo: 'Amarok', anio: 2021, km: 55000, precio: 29500, moneda: 'USD' });
        const r = sugerir(
            { modo: 'unidad', unidadBuscada: amarok, presupuestoMax: 20000000, monedaPresupuesto: 'ARS' },
            [amarok, otra],
        );
        expect(ids(r)).toEqual([otra.id]);
        expect(r.alternativas[0].porEncimaDelMaximo).toBeUndefined();
    });
});

// ===========================================================================
/*
 * EL TECHO DEL PRESUPUESTO FUERA DEL MODO PRESUPUESTO.
 *
 * El rango relevado se arrastra a los otros dos modos (lo necesita el upsell del
 * criterio 3 del modo modelo), pero ahí NO puede FILTRAR: un cliente que pregunta
 * por una unidad más cara que lo que dijo al entrar es el caso normal, y
 * descartarle en silencio las otras unidades del mismo modelo dejaba la búsqueda
 * en cero con un aviso que le echaba la culpa a los criterios de cercanía.
 */
describe('el máximo relevado: filtra en presupuesto, MARCA en modelo y unidad', () => {
    const HILUX_26 = u({ id: 100, modelo: 'Hilux', version: 'SRX', anio: 2023, km: 30000, precio: 26000000 });
    const HILUX_24 = u({ id: 101, modelo: 'Hilux', version: 'SRV', anio: 2022, km: 45000, precio: 24000000 });
    const HILUX_28 = u({ id: 102, modelo: 'Hilux', version: 'SRX', anio: 2024, km: 12000, precio: 28000000 });

    it('modo UNIDAD: un techo viejo NO se come las alternativas del mismo modelo', () => {
        const r = sugerir(
            { modo: 'unidad', unidadBuscada: HILUX_26, presupuestoMax: 20000000 },
            [HILUX_26, HILUX_24, HILUX_28],
        );
        expect(ids(r).sort()).toEqual([HILUX_24.id, HILUX_28.id]);
        // Y lo que supera el máximo se DICE, no se calla: el vendedor no puede leer
        // en voz alta "es 2% más barato" sobre un auto que está arriba del techo.
        r.alternativas.forEach((a) => {
            expect(a.porEncimaDelMaximo).toBe(true);
            expect(a.motivo).toContain('por encima del máximo relevado');
        });
    });

    it('la EXACTA por encima del máximo también queda marcada', () => {
        const r = sugerir(
            { modo: 'unidad', unidadBuscada: HILUX_26, presupuestoMax: 20000000 },
            [HILUX_26, HILUX_24],
        );
        expect(r.exactaPorEncimaDelMaximo).toBe(true);
    });

    it('modo MODELO: la alternativa arriba del techo dice cuánto', () => {
        const r = sugerir(
            { modo: 'modelo', marca: 'Toyota', modelo: 'Hilux', presupuestoMax: 20000000 },
            [HILUX_26, HILUX_24, HILUX_28],
        );
        expect(r.alternativas.length).toBeGreaterThan(0);
        r.alternativas.forEach((a) => {
            expect(a.porEncimaDelMaximo).toBe(true);
            expect(a.motivo).toContain('por encima del máximo relevado');
        });
    });

    it('modo PRESUPUESTO: ahí el techo SIGUE filtrando duro (nada pasa el +10%)', () => {
        const r = sugerir({ modo: 'presupuesto', presupuestoMax: 20000000 }, [HILUX_26, HILUX_24, HILUX_28]);
        expect(r.alternativas).toHaveLength(0);
        expect(r.exacta).toBeUndefined();
    });

    it('lo que NO supera el máximo no se marca por las dudas', () => {
        const r = sugerir(
            { modo: 'unidad', unidadBuscada: HILUX_26, presupuestoMax: 30000000 },
            [HILUX_26, HILUX_24],
        );
        expect(r.exactaPorEncimaDelMaximo).toBeUndefined();
        expect(r.alternativas[0].porEncimaDelMaximo).toBeUndefined();
    });
});

// ===========================================================================
describe('criterio 3 del presupuesto: rotación de verdad, no cualquier unidad', () => {
    it('una unidad recién ingresada NO se ofrece "porque lleva 0 días en stock"', () => {
        const stock = [
            { ...CRONOS_22, diasEnStock: 0 },
            { ...P208_21, diasEnStock: 1 },
            { ...FOCUS_18, diasEnStock: 2 },
        ];
        const r = sugerir({ modo: 'presupuesto', presupuestoMin: 15000000, presupuestoMax: 26000000 }, stock);
        motivos(r).forEach((m) => expect(m).not.toContain('en stock'));
    });

    it('pasado el umbral sí aparece, y el motivo concuerda en número', () => {
        const parada = { ...CRUZE_20, diasEnStock: DIAS_STOCK_PARA_ROTACION + 127 };
        const r = sugerir(
            { modo: 'presupuesto', presupuestoMin: 20000000, presupuestoMax: 32000000 },
            [CRONOS_22, P208_21, parada],
        );
        const rot = r.alternativas.find((a) => a.motivo.includes('en stock'));
        expect(rot?.unidad.id).toBe(parada.id);
        expect(rot?.motivo).toContain(`lleva ${DIAS_STOCK_PARA_ROTACION + 127} días en stock`);
    });

    it('un solo día en stock se dice en singular ("1 día", no "1 días")', () => {
        const unDia = { ...CRUZE_20, diasEnStock: 1 };
        const r = sugerir(
            { modo: 'presupuesto', presupuestoMin: 20000000, presupuestoMax: 32000000 },
            [CRONOS_22, P208_21, unDia],
        );
        // Con el piso vigente no se emite; si alguna vez se baja el umbral a 1, la
        // concordancia tiene que seguir siendo correcta.
        motivos(r).forEach((m) => expect(m).not.toContain('1 días en stock'));
    });

    it('la unidad marcada como prioridad de venta se ofrece aunque sea stock fresco', () => {
        const prioritaria = { ...CRUZE_20, diasEnStock: 3, prioridadVenta: true };
        const r = sugerir(
            { modo: 'presupuesto', presupuestoMin: 20000000, presupuestoMax: 32000000 },
            [CRONOS_22, P208_21, prioritaria],
        );
        const rot = r.alternativas.find((a) => a.motivo.includes('prioridad de venta'));
        expect(rot?.unidad.id).toBe(prioritaria.id);
        // Sin el piso de días, el motivo le agregaba "lleva 3 días en stock" como
        // argumento de rotación, que es el argumento inverso al que quiere dar.
        expect(rot?.motivo).not.toContain('en stock');
    });
});
