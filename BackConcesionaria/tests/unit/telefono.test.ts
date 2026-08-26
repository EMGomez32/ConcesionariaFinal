import { mismoTelefono, normalizarTelefono, soloDigitos, sufijoTelefono } from '../../src/domain/services/telefono';
import {
    CandidatoDedupe,
    elegirPorPrioridad,
    mismoTelefonoOLiteral,
    normalizarDni,
    normalizarEmail,
    PRIORIDAD_DEDUPE,
    variantesDni,
} from '../../src/domain/services/dedupeContacto';

// Unit tests PUROS (sin DB): son el criterio de aceptación 2 —"un cliente que ya
// consultó por redes NO se duplica al venir presencialmente"— probado sobre los
// dos módulos de dominio que lo deciden. Corren standalone:
//   npx jest tests/unit/telefono.test.ts
// sin el stack docker levantado y sin DATABASE_URL real.

describe('normalizarTelefono', () => {
    describe('el MISMO número escrito de mil formas', () => {
        // El caso del encargo: un lead de Instagram trae "+54 9 261 555-1234" y
        // el vendedor en el mostrador tipea "2615551234". Es la misma persona.
        const mendoza = [
            '+54 9 261 555-1234',   // internacional con el 9 de celular (Meta)
            '+5492615551234',       // idem, pegado (Mercado Libre / WhatsApp)
            '5492615551234',        // idem sin el "+"
            '0054 9 261 555 1234',  // con prefijo de salida internacional
            '0261 15 555-1234',     // nacional: 0 de larga distancia + 15
            '(0261) 15-5551234',    // idem con paréntesis
            '261 555 1234',         // NSN con espacios
            '261.555.1234',         // NSN con puntos
            '2615551234',           // NSN pelado (lo que tipea el mostrador)
            '  2615551234  ',       // con espacios de sobra
            '+54 261 15 555 1234',  // internacional CON el 15 redundante
            '+54 9 261 15 555 1234',// las dos marcas de celular a la vez
        ];

        it.each(mendoza)('«%s» → 2615551234', (escritura) => {
            expect(normalizarTelefono(escritura)).toBe('2615551234');
        });

        it('las doce escrituras colapsan en UNA sola forma canónica', () => {
            expect(new Set(mendoza.map((t) => normalizarTelefono(t))).size).toBe(1);
        });
    });

    describe('códigos de área de 2, 3 y 4 dígitos', () => {
        it('Buenos Aires (área 11, abonado de 8): saca el 15 en la posición 2', () => {
            expect(normalizarTelefono('011 15 4123-4567')).toBe('1141234567');
            expect(normalizarTelefono('+54 9 11 4123 4567')).toBe('1141234567');
            expect(normalizarTelefono('11 4123-4567')).toBe('1141234567');
        });

        it('Mendoza (área 261, abonado de 7): saca el 15 en la posición 3', () => {
            expect(normalizarTelefono('0261 15 555-1234')).toBe('2615551234');
        });

        it('Río Gallegos (área 2966, abonado de 6): saca el 15 en la posición 4', () => {
            expect(normalizarTelefono('02966 15 42-1234')).toBe('2966421234');
            expect(normalizarTelefono('+54 9 2966 42 1234')).toBe('2966421234');
        });

        it('un fijo de 10 dígitos que contiene "15" NO se toca', () => {
            // 011 1512-3456 es un abonado que arranca con 15: como ya son 10
            // dígitos, la regla del 15 (que sólo corre con 12) ni se intenta.
            expect(normalizarTelefono('011 1512-3456')).toBe('1115123456');
            expect(normalizarTelefono('1115123456')).toBe('1115123456');
        });
    });

    describe('números que NO son el mismo', () => {
        it('distinta área: Mendoza vs Rosario', () => {
            expect(mismoTelefono('+54 9 261 555-1234', '+54 9 341 555-1234')).toBe(false);
        });

        it('distinto abonado por un dígito', () => {
            expect(mismoTelefono('2615551234', '2615551235')).toBe(false);
        });

        it('el local sin área NO se fusiona con el número completo', () => {
            // A propósito: no hay forma de saber el área, y adivinarla fusionaría
            // las fichas de dos personas distintas (peor que duplicar).
            expect(mismoTelefono('555-1234', '261 555-1234')).toBe(false);
            expect(mismoTelefono('15 555-1234', '+54 9 261 555-1234')).toBe(false);
        });

        it('dos celulares distintos de la misma área', () => {
            expect(mismoTelefono('0261 15 555-1234', '0261 15 444-9876')).toBe(false);
        });

        it('un número de otro país no se confunde con uno argentino', () => {
            expect(mismoTelefono('+56 9 6155 1234', '+54 9 261 555-1234')).toBe(false);
        });
    });

    describe('vacío y basura', () => {
        it.each([null, undefined, '', '   ', '-', '()', 'sin datos', 's/d', 'no tiene'])(
            '«%s» no es un teléfono → null',
            (valor) => {
                expect(normalizarTelefono(valor as string | null | undefined)).toBeNull();
            },
        );

        it('menos de 6 dígitos no alcanza para deduplicar', () => {
            // Devolver "0" o "15" como forma canónica haría matchear entre sí a
            // todas las fichas que tengan basura cargada en el teléfono.
            expect(normalizarTelefono('0')).toBeNull();
            expect(normalizarTelefono('15')).toBeNull();
            expect(normalizarTelefono('int. 402')).toBeNull();
            expect(normalizarTelefono('12345')).toBeNull();
        });

        it('6 dígitos o más se aceptan como mejor esfuerzo', () => {
            expect(normalizarTelefono('421234')).toBe('421234');
        });

        it('mismoTelefono con null/basura siempre da false, aunque el texto coincida', () => {
            expect(mismoTelefono(null, null)).toBe(false);
            expect(mismoTelefono('s/d', 's/d')).toBe(false);
            expect(mismoTelefono('2615551234', null)).toBe(false);
        });

        it('soloDigitos limpia todo lo que no sea número', () => {
            expect(soloDigitos('+54 (9) 261 555-1234')).toBe('5492615551234');
            expect(soloDigitos(null)).toBe('');
        });
    });

    describe('sufijoTelefono (acota los candidatos en la base)', () => {
        it('son los últimos 4 dígitos de la forma canónica', () => {
            expect(sufijoTelefono('+54 9 261 555-1234')).toBe('1234');
            expect(sufijoTelefono('0261 15 555-1234')).toBe('1234');
            expect(sufijoTelefono('2615551234')).toBe('1234');
        });

        it('null si no hay número', () => {
            expect(sufijoTelefono('s/d')).toBeNull();
            expect(sufijoTelefono(null)).toBeNull();
        });
    });
});

describe('normalizarDni', () => {
    it('puntos, espacios y ceros a la izquierda son el mismo documento', () => {
        expect(normalizarDni('30.123.456')).toBe('30123456');
        expect(normalizarDni('30 123 456')).toBe('30123456');
        expect(normalizarDni(' 30123456 ')).toBe('30123456');
        expect(normalizarDni('07.123.456')).toBe('7123456');
        expect(normalizarDni('7123456')).toBe('7123456');
    });

    it('basura y documentos imposibles → null', () => {
        expect(normalizarDni(null)).toBeNull();
        expect(normalizarDni('')).toBeNull();
        expect(normalizarDni('s/d')).toBeNull();
        expect(normalizarDni('123')).toBeNull();
    });

    it('un CUIT no se recorta para hacerlo pasar por DNI', () => {
        expect(normalizarDni('20-30123456-9')).toBe('20301234569');
        expect(normalizarDni('20-30123456-9')).not.toBe(normalizarDni('30123456'));
    });
});

describe('variantesDni (cómo se lo busca en la base)', () => {
    it('cubre las escrituras que se ven en la práctica', () => {
        expect(variantesDni('30123456')).toEqual(
            expect.arrayContaining(['30123456', '30.123.456', '30 123 456']),
        );
    });

    it('un documento de 7 dígitos suma la variante padeada con cero', () => {
        expect(variantesDni('7123456')).toEqual(
            expect.arrayContaining(['7123456', '7.123.456', '07123456', '07.123.456']),
        );
    });

    it('no repite escrituras', () => {
        const v = variantesDni('30123456');
        expect(new Set(v).size).toBe(v.length);
    });
});

describe('normalizarEmail', () => {
    it('trim + minúsculas', () => {
        expect(normalizarEmail('  Juan.Perez@Gmail.COM ')).toBe('juan.perez@gmail.com');
        expect(normalizarEmail('   ')).toBeNull();
        expect(normalizarEmail(null)).toBeNull();
    });
});

describe('mismoTelefonoOLiteral', () => {
    it('usa la forma canónica cuando los dos lados son números reconocibles', () => {
        expect(mismoTelefonoOLiteral('+54 9 261 555-1234', '2615551234')).toBe(true);
        expect(mismoTelefonoOLiteral('2615551234', '3415551234')).toBe(false);
    });

    it('cae al criterio literal SÓLO si ninguno de los dos es normalizable', () => {
        // Es el criterio que regía antes del módulo: no se pierde ningún match
        // que hoy funcione (un interno, el texto de una importación vieja).
        expect(mismoTelefonoOLiteral('int. 402', 'int. 402')).toBe(true);
        expect(mismoTelefonoOLiteral('int. 402', 'int. 403')).toBe(false);
    });

    it('un número reconocible nunca matchea contra basura', () => {
        expect(mismoTelefonoOLiteral('2615551234', 's/d')).toBe(false);
        expect(mismoTelefonoOLiteral('s/d', '2615551234')).toBe(false);
    });

    it('vacío contra vacío no es un match', () => {
        expect(mismoTelefonoOLiteral(null, null)).toBe(false);
        expect(mismoTelefonoOLiteral('  ', '')).toBe(false);
    });
});

describe('elegirPorPrioridad (TELÉFONO → DNI → EMAIL)', () => {
    const c = (id: number, datos: Partial<CandidatoDedupe> = {}): CandidatoDedupe => ({
        id,
        telefono: null,
        dni: null,
        email: null,
        ...datos,
    });

    it('el orden declarado es el del encargo', () => {
        expect(PRIORIDAD_DEDUPE).toEqual(['telefono', 'dni', 'email']);
    });

    it('EL CASO DEL ENCARGO: el lead de Instagram y el que viene al salón son uno solo', () => {
        const deInstagram = c(7, { telefono: '+54 9 261 555-1234', email: null });
        const enElMostrador = { telefono: '2615551234', dni: null, email: null };
        expect(elegirPorPrioridad(enElMostrador, [deInstagram])).toEqual({ cliente: deInstagram, campo: 'telefono' });
    });

    it('el TELÉFONO gana cuando teléfono y email apuntan a clientes DISTINTOS', () => {
        const porTelefono = c(50, { telefono: '0261 15 555-1234' });
        const porEmail = c(2, { email: 'juan@gmail.com' });
        const match = elegirPorPrioridad(
            { telefono: '+54 9 261 555-1234', email: 'juan@gmail.com' },
            [porEmail, porTelefono],
        );
        // Gana el del teléfono AUNQUE su id sea mayor: la prioridad manda sobre
        // la antigüedad; el id sólo desempata DENTRO de un mismo criterio.
        expect(match).toEqual({ cliente: porTelefono, campo: 'telefono' });
    });

    it('el DNI gana sobre el email, y pierde contra el teléfono', () => {
        const porDni = c(50, { dni: '30.123.456' });
        const porEmail = c(2, { email: 'juan@gmail.com' });
        const porTelefono = c(90, { telefono: '2615551234' });
        const buscado = { telefono: '+54 9 261 555-1234', dni: '30123456', email: 'juan@gmail.com' };

        expect(elegirPorPrioridad(buscado, [porEmail, porDni])).toEqual({ cliente: porDni, campo: 'dni' });
        expect(elegirPorPrioridad(buscado, [porEmail, porDni, porTelefono])).toEqual({
            cliente: porTelefono,
            campo: 'telefono',
        });
    });

    it('dentro de un mismo criterio gana la ficha más vieja (id menor)', () => {
        const vieja = c(3, { telefono: '2615551234' });
        const nueva = c(80, { telefono: '+54 9 261 555 1234' });
        expect(elegirPorPrioridad({ telefono: '0261 15 555-1234' }, [nueva, vieja])?.cliente).toBe(vieja);
    });

    it('el email se compara en minúsculas', () => {
        const existente = c(4, { email: 'juan.perez@gmail.com' });
        expect(elegirPorPrioridad({ email: '  Juan.Perez@GMAIL.com ' }, [existente])).toEqual({
            cliente: existente,
            campo: 'email',
        });
    });

    it('sin contacto buscado no hay match (no se fusiona por nombre)', () => {
        expect(elegirPorPrioridad({}, [c(1, { telefono: '2615551234' })])).toBeNull();
        expect(elegirPorPrioridad({ telefono: '   ', email: '' }, [c(1, { telefono: '2615551234' })])).toBeNull();
    });

    it('sin candidatos, null', () => {
        expect(elegirPorPrioridad({ telefono: '2615551234' }, [])).toBeNull();
    });

    it('candidatos que no matchean por ningún campo se descartan', () => {
        const otro = c(1, { telefono: '3415559999', dni: '11222333', email: 'otro@gmail.com' });
        expect(elegirPorPrioridad({ telefono: '2615551234', dni: '30123456', email: 'juan@gmail.com' }, [otro])).toBeNull();
    });

    it('un candidato sin el campo buscado no matchea por nulls', () => {
        // Bug clásico: null === null daría true y fusionaría media cartera.
        const sinContacto = c(1);
        expect(elegirPorPrioridad({ telefono: null, dni: null, email: null }, [sinContacto])).toBeNull();
        expect(elegirPorPrioridad({ telefono: '2615551234' }, [sinContacto])).toBeNull();
    });
});
