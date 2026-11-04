// Unit tests PUROS (sin DB ni server) de las piezas de privacidad: plazos legales de los
// pedidos de titulares, catálogo de consentimiento, rastro (deduplicador, tenants de una
// respuesta, filtros enmascarados), configuración del script de retención y el
// seudónimo del email.
jest.mock('../../src/infrastructure/database/prisma', () => ({
    rawPrisma: { securityEvent: { create: jest.fn() } },
}));
jest.mock('../../src/infrastructure/logging/logger', () => ({
    logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import crypto from 'crypto';
import { vencimientoLegal, sumarDiasHabiles, estaVencida, aDiaUtc } from '../../src/domain/services/plazosTitular';
import {
    TEXTOS_CONSENTIMIENTO,
    VERSION_CONSENTIMIENTO_VIGENTE,
    esVersionConsentimiento,
    textoDeConsentimiento,
} from '../../src/domain/services/consentimiento';
import { Deduplicador, tenantsEnRespuesta, describirFiltros, exportConDatosPersonales } from '../../src/infrastructure/security/rastroPrivacidad';
import {
    leerPlazos,
    leerArgs,
    restarMeses,
    calcularCortes,
    PLAZOS_POR_DEFECTO,
} from '../../src/application/services/privacidad/retencion';
import { esContactable } from '../../src/application/services/privacidad/contactabilidad';
import { hashEmail } from '../../src/infrastructure/security/securityEvents';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);

describe('plazos legales de los pedidos de titulares (Ley 25.326)', () => {
    test('acceso: 10 días corridos (art. 14), cuentan fines de semana', () => {
        // Lunes 2 de noviembre de 2026 → jueves 12.
        expect(iso(vencimientoLegal('acceso', d('2026-11-02')))).toBe('2026-11-12');
    });

    test('rectificación y supresión: 5 días hábiles (art. 16), sin sábados ni domingos', () => {
        // Lunes 2 → lunes 9 (mar, mié, jue, vie, lun).
        expect(iso(vencimientoLegal('rectificacion', d('2026-11-02')))).toBe('2026-11-09');
        // Viernes 6 → viernes 13.
        expect(iso(vencimientoLegal('supresion', d('2026-11-06')))).toBe('2026-11-13');
        // Un pedido que entra un sábado empieza a contar el lunes: sábado 7 → viernes 13.
        expect(iso(vencimientoLegal('supresion', d('2026-11-07')))).toBe('2026-11-13');
    });

    test('bloqueo y oposición usan el plazo del art. 16', () => {
        expect(iso(vencimientoLegal('bloqueo', d('2026-11-02')))).toBe('2026-11-09');
        expect(iso(vencimientoLegal('oposicion', d('2026-11-02')))).toBe('2026-11-09');
    });

    test('la hora del día no corre el vencimiento', () => {
        expect(iso(vencimientoLegal('acceso', new Date('2026-11-02T23:59:00Z')))).toBe('2026-11-12');
        expect(iso(sumarDiasHabiles(new Date('2026-11-02T13:00:00Z'), 1))).toBe('2026-11-03');
    });

    test('vencida = pasó el día de vencimiento sin cerrarse', () => {
        const s = { estado: 'pendiente', venceEl: d('2026-11-09') };
        expect(estaVencida(s, new Date('2026-11-09T22:00:00Z'))).toBe(false);
        expect(estaVencida(s, new Date('2026-11-10T00:01:00Z'))).toBe(true);
        expect(estaVencida({ ...s, estado: 'resuelta' }, d('2027-01-01'))).toBe(false);
        expect(estaVencida({ ...s, estado: 'rechazada' }, d('2027-01-01'))).toBe(false);
        expect(aDiaUtc(new Date('2026-11-09T22:00:00Z')).toISOString()).toBe('2026-11-09T00:00:00.000Z');
    });
});

describe('catálogo de textos de consentimiento', () => {
    test('la versión vigente existe y tiene texto', () => {
        expect(esVersionConsentimiento(VERSION_CONSENTIMIENTO_VIGENTE)).toBe(true);
        expect(textoDeConsentimiento(VERSION_CONSENTIMIENTO_VIGENTE)).toMatch(/conformidad para ser contactado/);
    });

    test('una versión desconocida o histórica (null) no tiene texto', () => {
        expect(esVersionConsentimiento('contacto-v99')).toBe(false);
        expect(esVersionConsentimiento(undefined)).toBe(false);
        expect(esVersionConsentimiento('toString')).toBe(false);
        expect(textoDeConsentimiento(null)).toBeNull();
    });

    test('la v1 publicada no cambió (una versión publicada no se edita: se agrega otra)', () => {
        expect(TEXTOS_CONSENTIMIENTO['contacto-v1']).toBe(
            'El cliente presta conformidad para ser contactado (Ley 25.326 de Protección de Datos Personales).',
        );
    });
});

describe('contactabilidad', () => {
    test('revocado o bloqueado = no contactable; nunca dio el consentimiento ≠ revocado', () => {
        expect(esContactable({ bloqueadoEn: null, consentimientoRevocadoEn: null })).toBe(true);
        expect(esContactable({ bloqueadoEn: new Date(), consentimientoRevocadoEn: null })).toBe(false);
        expect(esContactable({ bloqueadoEn: null, consentimientoRevocadoEn: new Date() })).toBe(false);
        expect(esContactable(null)).toBe(true);
    });
});

describe('rastro de privacidad', () => {
    test('Deduplicador: un registro por clave por ventana fija', () => {
        let t = 0;
        const dd = new Deduplicador(1000, 100, () => t);
        expect(dd.debeRegistrar('a')).toBe(true);
        t = 500; expect(dd.debeRegistrar('a')).toBe(false);
        expect(dd.debeRegistrar('b')).toBe(true);
        t = 1000; expect(dd.debeRegistrar('a')).toBe(true);
        // Ventana FIJA desde el último registro: seguir leyendo no la estira.
        t = 1999; expect(dd.debeRegistrar('a')).toBe(false);
        t = 2000; expect(dd.debeRegistrar('a')).toBe(true);
    });

    test('Deduplicador no crece sin límite', () => {
        let t = 0;
        const dd = new Deduplicador(10, 3, () => t);
        for (let i = 0; i < 10; i++) { t = i * 100; dd.debeRegistrar(`k${i}`); }
        // Las viejas se purgaron: una clave vieja vuelve a registrarse.
        t = 5000;
        expect(dd.debeRegistrar('k0')).toBe(true);
    });

    test('tenantsEnRespuesta: ficha, listado paginado, array y relaciones', () => {
        expect([...tenantsEnRespuesta({ id: 1, concesionariaId: 7 })]).toEqual([7]);
        expect([...tenantsEnRespuesta({ results: [{ concesionariaId: 1 }, { concesionariaId: 2 }, { concesionariaId: 1 }] })].sort()).toEqual([1, 2]);
        expect([...tenantsEnRespuesta([{ concesionariaId: 3 }])]).toEqual([3]);
        expect(tenantsEnRespuesta({ total: 5, porMes: [{ mes: 1 }] }).size).toBe(0);
        expect(tenantsEnRespuesta(null).size).toBe(0);
        expect(tenantsEnRespuesta('texto').size).toBe(0);
        expect(tenantsEnRespuesta({ concesionariaId: 0 }).size).toBe(0);
    });

    test('describirFiltros enmascara los filtros que pueden ser datos personales', () => {
        const txt = describirFiltros({ search: '30111222', estadoLead: 'nuevo', page: '2', dni: '123', format: 'csv' });
        expect(txt).toContain('search=[8 caracteres]');
        expect(txt).toContain('dni=[3 caracteres]');
        expect(txt).toContain('estadoLead=nuevo');
        expect(txt).not.toContain('30111222');
        expect(txt).not.toContain('page');
        expect(describirFiltros({})).toBe('sin filtros');
    });

    test('exportConDatosPersonales reconoce los CSV con PII', () => {
        expect(exportConDatosPersonales('clientes-2026-11-03.csv')).toBe(true);
        expect(exportConDatosPersonales('reporte-mora-2026-11-03.csv')).toBe(true);
        expect(exportConDatosPersonales('stock-vehiculos-2026-11-03.csv')).toBe(false);
    });
});

describe('script de retención: configuración y guardas', () => {
    test('defaults cuando no hay variables', () => {
        expect(leerPlazos({})).toEqual(PLAZOS_POR_DEFECTO);
        expect(PLAZOS_POR_DEFECTO).toEqual({ leadsMeses: 24, adjuntosRechazadasMeses: 6, auditoriaMeses: 24 });
    });

    test('plazos configurables por entorno; 0 desactiva', () => {
        expect(leerPlazos({ RETENCION_LEADS_MESES: '36', RETENCION_AUDITORIA_MESES: '0' }))
            .toEqual({ leadsMeses: 36, adjuntosRechazadasMeses: 6, auditoriaMeses: 0 });
    });

    test('pisos anti-accidente y valores inválidos abortan', () => {
        expect(() => leerPlazos({ RETENCION_AUDITORIA_MESES: '2' })).toThrow(/mínimo es 12/);
        expect(() => leerPlazos({ RETENCION_LEADS_MESES: '3' })).toThrow(/mínimo es 6/);
        expect(() => leerPlazos({ RETENCION_ADJUNTOS_RECHAZADAS_MESES: '-1' })).toThrow(/entero/);
        expect(() => leerPlazos({ RETENCION_LEADS_MESES: 'dos' })).toThrow(/entero/);
    });

    test('dry-run por defecto; --apply explícito; argumentos raros abortan', () => {
        expect(leerArgs([])).toMatchObject({ aplicar: false, sinTope: false, concesionariaId: null });
        expect(leerArgs(['--apply', '--concesionaria=7', '--solo=adjuntos,tokens']))
            .toEqual({ aplicar: true, sinTope: false, concesionariaId: 7, categorias: ['adjuntos', 'tokens'] });
        expect(() => leerArgs(['--aply'])).toThrow(/desconocido/);
        expect(() => leerArgs(['--concesionaria=0'])).toThrow(/entero positivo/);
        expect(() => leerArgs(['--solo=todo'])).toThrow(/categorías válidas/);
    });

    test('restarMeses respeta el fin de mes y los cortes salen de los plazos', () => {
        expect(restarMeses(d('2026-03-31'), 1).toISOString().slice(0, 10)).toBe('2026-02-28');
        expect(restarMeses(d('2026-11-03'), 24).toISOString().slice(0, 10)).toBe('2024-11-03');
        const c = calcularCortes({ leadsMeses: 24, adjuntosRechazadasMeses: 6, auditoriaMeses: 0 }, d('2026-11-03'));
        expect(iso(c.leads!)).toBe('2024-11-03');
        expect(iso(c.adjuntos!)).toBe('2026-05-03');
        expect(c.auditoria).toBeNull();
    });
});

describe('seudónimo del email en security_events (PRIV-19)', () => {
    const original = process.env.JWT_SECRET;
    afterAll(() => {
        if (original === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = original;
    });

    test('es un HMAC con clave del servidor, no un SHA-256 a secas', () => {
        process.env.JWT_SECRET = 'secreto-de-prueba-1234567890';
        const sinClave = crypto.createHash('sha256').update('victima@demo.com').digest('hex').slice(0, 32);
        expect(hashEmail('victima@demo.com')).not.toBe(sinClave);
        expect(hashEmail(' Victima@Demo.com ')).toBe(hashEmail('victima@demo.com'));
    });

    test('cambia con la clave: un diccionario sin el secreto no sirve', () => {
        process.env.JWT_SECRET = 'secreto-de-prueba-1234567890';
        const a = hashEmail('victima@demo.com');
        process.env.JWT_SECRET = 'otro-secreto-distinto-0987654321';
        expect(hashEmail('victima@demo.com')).not.toBe(a);
    });
});
