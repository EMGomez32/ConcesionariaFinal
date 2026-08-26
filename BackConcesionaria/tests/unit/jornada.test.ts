import { corteDeLaJornada, ventanaDeAlertaDesde } from '../../src/domain/services/jornada';

/**
 * El corte de jornada decide QUÉ atenciones cierra el sistema al final del día.
 * Un error de un día acá tiene dos formas, las dos silenciosas: o nunca cierra
 * nada (y el vendedor arrastra atenciones abiertas para siempre), o cierra las de
 * hoy a media mañana (y le borra el trabajo en curso). Por eso se prueba con
 * instantes concretos, no con `new Date()`.
 *
 * Todos los casos usan hora de corte 21 y offset −3 (Argentina), que son los
 * defaults de `ATENCION_CIERRE_HORA` / `ATENCION_CIERRE_UTC_OFFSET`.
 * Recordatorio de conversión: 21:00 local = 00:00 UTC del día siguiente.
 */
const HORA = 21;
const OFFSET = -3;

const corte = (isoUtc: string) => corteDeLaJornada(new Date(isoUtc), HORA, OFFSET).toISOString();

describe('corteDeLaJornada', () => {
    test('a media tarde, el corte vigente todavía es el de ANOCHE', () => {
        // 2026-08-25 18:00 UTC = 15:00 local. El corte de hoy (21:00 local =
        // 2026-08-26 00:00 UTC) no llegó, así que manda el de ayer.
        expect(corte('2026-08-25T18:00:00.000Z')).toBe('2026-08-25T00:00:00.000Z');
    });

    test('pasada la hora de corte, manda el de HOY', () => {
        // 2026-08-26 01:30 UTC = 22:30 local del 25. El corte del 25 (00:00 UTC
        // del 26) ya pasó.
        expect(corte('2026-08-26T01:30:00.000Z')).toBe('2026-08-26T00:00:00.000Z');
    });

    test('justo en el instante del corte, el corte es ese mismo (no el de ayer)', () => {
        // El borde es `<=`: a las 21:00:00 clavadas la jornada ya cerró. Si fuera
        // `<`, el barrido que cae exactamente en ese milisegundo saltearía el día.
        expect(corte('2026-08-26T00:00:00.000Z')).toBe('2026-08-26T00:00:00.000Z');
    });

    test('un milisegundo ANTES del corte todavía es la jornada anterior', () => {
        expect(corte('2026-08-25T23:59:59.999Z')).toBe('2026-08-25T00:00:00.000Z');
    });

    test('a la mañana siguiente el corte de anoche sigue vigente (worker caído toda la noche)', () => {
        // 2026-08-26 12:00 UTC = 09:00 local. Es la garantía de que una atención
        // que quedó abierta anoche se cierra igual, aunque el contenedor haya
        // estado reiniciando a las 21.
        expect(corte('2026-08-26T12:00:00.000Z')).toBe('2026-08-26T00:00:00.000Z');
    });

    test('cruza el fin de mes sin inventar un día 32', () => {
        // 2026-08-31 18:00 UTC = 15:00 local del 31 → corte vigente: el del 30.
        expect(corte('2026-08-31T18:00:00.000Z')).toBe('2026-08-31T00:00:00.000Z');
        // 2026-09-01 02:00 UTC = 23:00 local del 31 → corte del 31.
        expect(corte('2026-09-01T02:00:00.000Z')).toBe('2026-09-01T00:00:00.000Z');
    });

    test('cruza el fin de año', () => {
        expect(corte('2027-01-01T02:00:00.000Z')).toBe('2027-01-01T00:00:00.000Z');
        expect(corte('2026-12-31T18:00:00.000Z')).toBe('2026-12-31T00:00:00.000Z');
    });

    test('una atención abierta HOY a la mañana NO entra en el corte vigente', () => {
        // Es la regla que evita que el worker borre trabajo en curso: el filtro del
        // updateMany es `iniciadaEn < corte`, así que basta con que el corte
        // vigente sea anterior a la apertura de hoy.
        const ahora = new Date('2026-08-25T18:00:00.000Z');           // 15:00 local
        const abiertaHoy = new Date('2026-08-25T13:00:00.000Z');      // 10:00 local
        const abiertaAyer = new Date('2026-08-24T22:00:00.000Z');     // 19:00 local de ayer
        const c = corteDeLaJornada(ahora, HORA, OFFSET);
        expect(abiertaHoy.getTime() < c.getTime()).toBe(false);
        expect(abiertaAyer.getTime() < c.getTime()).toBe(true);
    });

    test('respeta una hora de corte distinta y otro offset', () => {
        // Salón que cierra a las 18, en UTC (offset 0): a las 17:00 manda el de ayer.
        expect(corteDeLaJornada(new Date('2026-08-25T17:00:00.000Z'), 18, 0).toISOString())
            .toBe('2026-08-24T18:00:00.000Z');
        expect(corteDeLaJornada(new Date('2026-08-25T19:00:00.000Z'), 18, 0).toISOString())
            .toBe('2026-08-25T18:00:00.000Z');
    });

    test('la medianoche como corte no colapsa en el mismo instante repetido', () => {
        // hora 0 con offset −3 ⇒ 00:00 local = 03:00 UTC.
        expect(corteDeLaJornada(new Date('2026-08-25T02:00:00.000Z'), 0, -3).toISOString())
            .toBe('2026-08-24T03:00:00.000Z');
        expect(corteDeLaJornada(new Date('2026-08-25T04:00:00.000Z'), 0, -3).toISOString())
            .toBe('2026-08-25T03:00:00.000Z');
    });
});

// ===========================================================================
describe('ventana de la alerta de atenciones cerradas por sistema', () => {
    /*
     * LA REGRESIÓN QUE ESTO IMPIDE: la ventana era el corte VIGENTE (las últimas
     * 24 h). El worker corre igual sábados y domingos, así que los cortes del fin
     * de semana la empujaban hacia adelante y el lunes la campanita mostraba 0
     * sobre las atenciones que el sistema había cerrado el viernes a la noche.
     */
    const CORTE_VIERNES = new Date('2026-08-22T00:00:00.000Z'); // viernes 21:00 ART
    const CERRADAS_EL_VIERNES = new Date('2026-08-22T00:01:00.000Z');

    test('el lunes a la mañana la alerta del viernes SIGUE adentro de la ventana', () => {
        const lunes9 = new Date('2026-08-24T12:00:00.000Z'); // lunes 09:00 ART
        const corteLunes = corteDeLaJornada(lunes9, 21, -3);
        // Con la ventana vieja (= el corte vigente) esto daba false: el domingo
        // 21:00 ya era posterior al cierre del viernes.
        expect(CERRADAS_EL_VIERNES.getTime() >= corteLunes.getTime()).toBe(false);
        // Con la ventana de 7 jornadas, sí entra.
        expect(CERRADAS_EL_VIERNES.getTime() >= ventanaDeAlertaDesde(corteLunes, 7).getTime()).toBe(true);
    });

    test('la ventana arranca en un BORDE de jornada, no en "ahora menos N días"', () => {
        // Dos lecturas del mismo día, a horas distintas, dan la misma ventana: el
        // conteo no puede cambiar según cuándo el vendedor abra la pantalla.
        const manana = corteDeLaJornada(new Date('2026-08-24T12:00:00.000Z'), 21, -3);
        const tarde = corteDeLaJornada(new Date('2026-08-24T20:00:00.000Z'), 21, -3);
        expect(ventanaDeAlertaDesde(manana, 7).toISOString())
            .toBe(ventanaDeAlertaDesde(tarde, 7).toISOString());
        expect(ventanaDeAlertaDesde(CORTE_VIERNES, 7).toISOString()).toBe('2026-08-15T00:00:00.000Z');
    });

    test('caduca sola: lo cerrado hace más de la ventana ya no cuenta', () => {
        const corte = corteDeLaJornada(new Date('2026-09-05T12:00:00.000Z'), 21, -3);
        expect(CERRADAS_EL_VIERNES.getTime() >= ventanaDeAlertaDesde(corte, 7).getTime()).toBe(false);
    });
});
