import {
    base32Decode, base32Encode, codigoTotp, generarCodigoRecuperacion, generarSecretoTotp, hashCodigoRecuperacion,
    hotp, normalizarCodigoRecuperacion, otpauthUrl, pasoDe, verificarTotp,
} from '../../src/infrastructure/security/totp';

// Unit tests PUROS. Vectores oficiales de la RFC 4226 (HOTP) y la RFC 6238 (TOTP, SHA1).
// Secreto de las RFC: ASCII "12345678901234567890".
const SECRETO_RFC = base32Encode(Buffer.from('12345678901234567890'));

describe('base32', () => {
    test('vectores de la RFC 4648', () => {
        expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
        expect(base32Encode(Buffer.from('fooba'))).toBe('MZXW6YTB');
        expect(base32Decode('MZXW6YTBOI').toString()).toBe('foobar');
    });

    test('ida y vuelta con bytes aleatorios', () => {
        const b = Buffer.from(Array.from({ length: 20 }, (_, i) => (i * 37 + 11) & 0xff));
        expect(base32Decode(base32Encode(b))).toEqual(b);
    });

    test('tolera minúsculas, espacios y padding', () => {
        expect(base32Decode('mzxw 6ytb oi======').toString()).toBe('foobar');
    });

    test('un carácter fuera del alfabeto es inválido', () => {
        expect(() => base32Decode('MZXW1')).toThrow();
    });
});

describe('HOTP (RFC 4226, apéndice D)', () => {
    test.each([
        [0, '755224'], [1, '287082'], [2, '359152'], [3, '969429'], [4, '338314'],
        [5, '254676'], [6, '287922'], [7, '162583'], [8, '399871'], [9, '520489'],
    ])('contador %i → %s', (contador, esperado) => {
        expect(hotp(SECRETO_RFC, contador)).toBe(esperado);
    });
});

describe('TOTP (RFC 6238, SHA1, 6 dígitos = los 6 últimos del vector de 8)', () => {
    test.each([
        [59, '287082'],          // 94287082
        [1111111109, '081804'],  // 07081804
        [1111111111, '050471'],  // 14050471
        [1234567890, '005924'],  // 89005924
        [2000000000, '279037'],  // 69279037
    ])('t=%i s → %s', (segundos, esperado) => {
        expect(codigoTotp(SECRETO_RFC, segundos * 1000)).toBe(esperado);
    });
});

describe('verificarTotp', () => {
    const AHORA = 1_700_000_000_000;
    const paso = pasoDe(AHORA);
    const codigo = (p: number) => hotp(SECRETO_RFC, p);

    test('el código actual es válido y devuelve su paso', () => {
        expect(verificarTotp(SECRETO_RFC, codigo(paso), { ahoraMs: AHORA })).toBe(paso);
    });

    test('tolera ±1 paso (reloj del teléfono desfasado)', () => {
        expect(verificarTotp(SECRETO_RFC, codigo(paso - 1), { ahoraMs: AHORA })).toBe(paso - 1);
        expect(verificarTotp(SECRETO_RFC, codigo(paso + 1), { ahoraMs: AHORA })).toBe(paso + 1);
    });

    test('fuera de la ventana se rechaza', () => {
        expect(verificarTotp(SECRETO_RFC, codigo(paso - 2), { ahoraMs: AHORA })).toBeNull();
        expect(verificarTotp(SECRETO_RFC, codigo(paso + 2), { ahoraMs: AHORA })).toBeNull();
    });

    test('REPLAY: un código ya usado (o más viejo) no vale otra vez', () => {
        expect(verificarTotp(SECRETO_RFC, codigo(paso), { ahoraMs: AHORA, ultimoPaso: paso })).toBeNull();
        expect(verificarTotp(SECRETO_RFC, codigo(paso - 1), { ahoraMs: AHORA, ultimoPaso: paso })).toBeNull();
        // Uno MÁS NUEVO que el último usado sí.
        expect(verificarTotp(SECRETO_RFC, codigo(paso + 1), { ahoraMs: AHORA, ultimoPaso: paso })).toBe(paso + 1);
    });

    test('tolera espacios (el usuario tipea "123 456")', () => {
        const c = codigo(paso);
        expect(verificarTotp(SECRETO_RFC, `${c.slice(0, 3)} ${c.slice(3)}`, { ahoraMs: AHORA })).toBe(paso);
    });

    test.each([['12345'], ['1234567'], ['abcdef'], [''], ['12 34'], ['１２３４５６']])('formato inválido (%p) se rechaza', (c) => {
        expect(verificarTotp(SECRETO_RFC, c, { ahoraMs: AHORA })).toBeNull();
    });

    test('un código de OTRO secreto no vale', () => {
        const otro = generarSecretoTotp();
        expect(verificarTotp(otro, codigo(paso), { ahoraMs: AHORA })).toBeNull();
    });
});

describe('generarSecretoTotp / otpauthUrl', () => {
    test('160 bits en base32 (32 caracteres) y distinto cada vez', () => {
        const a = generarSecretoTotp();
        expect(a).toMatch(/^[A-Z2-7]{32}$/);
        expect(generarSecretoTotp()).not.toBe(a);
    });

    test('la URI tiene lo que las apps necesitan', () => {
        const u = new URL(otpauthUrl({ secreto: 'JBSWY3DPEHPK3PXP', cuenta: 'ana@demo.com', emisor: 'AUTENZA' }));
        expect(u.protocol).toBe('otpauth:');
        expect(u.host).toBe('totp');
        expect(decodeURIComponent(u.pathname)).toBe('/AUTENZA:ana@demo.com');
        expect(u.searchParams.get('secret')).toBe('JBSWY3DPEHPK3PXP');
        expect(u.searchParams.get('issuer')).toBe('AUTENZA');
        expect(u.searchParams.get('period')).toBe('30');
        expect(u.searchParams.get('digits')).toBe('6');
    });
});

describe('códigos de recuperación', () => {
    test('formato xxxxx-xxxxx, sin caracteres ambiguos, y distintos', () => {
        const codigos = new Set(Array.from({ length: 50 }, generarCodigoRecuperacion));
        expect(codigos.size).toBe(50);
        for (const c of codigos) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    });

    test('normaliza lo que tipea el usuario', () => {
        expect(normalizarCodigoRecuperacion('abcde-fghjk')).toBe('ABCDE-FGHJK');
        expect(normalizarCodigoRecuperacion(' abcde fghjk ')).toBe('ABCDE-FGHJK');
        expect(normalizarCodigoRecuperacion('ABCDEFGHJK')).toBe('ABCDE-FGHJK');
    });

    test.each([[''], ['ABCDE'], ['ABCDE-FGHJK-LMNPQ'], ['ABCDE-FGHI0'], ['ABCDE-FGHJ!']])('formato inválido (%p) → null', (c) => {
        expect(normalizarCodigoRecuperacion(c)).toBeNull();
    });

    test('el hash es estable, no contiene el código y cambia con el código', () => {
        const h = hashCodigoRecuperacion('ABCDE-FGHJK');
        expect(h).toBe(hashCodigoRecuperacion('ABCDE-FGHJK'));
        expect(h).toMatch(/^[0-9a-f]{64}$/);
        expect(h).not.toContain('ABCDE');
        expect(hashCodigoRecuperacion('ABCDE-FGHJL')).not.toBe(h);
    });
});
