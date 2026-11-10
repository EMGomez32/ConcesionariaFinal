// Unit tests (sin DB ni entorno) de APP-11: vencimiento absoluto de la sesión, herencia de la
// familia en cada rotación, conservar la sesión web al cambiar credenciales y qué respuestas
// llevan el refresh en el cuerpo.
const envMock: Record<string, unknown> = { NODE_ENV: 'test', JWT_SECRET: 'secreto-de-prueba-largo-1234567890', SESION_MAX_DIAS: 30 };
jest.mock('../../src/config/env', () => ({ env: envMock }));
jest.mock('../../src/config', () => ({ __esModule: true, default: { jwt: { refreshExpirationDays: '7d' } } }));
const securityEventCreate = jest.fn().mockResolvedValue({});
jest.mock('../../src/infrastructure/database/prisma', () => ({ __esModule: true, default: {}, rawPrisma: { securityEvent: { create: (...a: unknown[]) => securityEventCreate(...a) } } }));
jest.mock('../../src/infrastructure/logging/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
// El refresh valida al usuario con withAuthBypass: acá devuelve un usuario activo de juguete.
const usuarioDb = { id: 7, activo: true, concesionariaId: 3, sucursalId: null, totpEnabled: false, roles: [{ deletedAt: null, rol: { nombre: 'vendedor', deletedAt: null } }] };
jest.mock('../../src/infrastructure/database/unitOfWork', () => ({
    withAuthBypass: (fn: (tx: unknown) => unknown) => fn({ usuario: { findFirst: async () => usuarioDb } }),
}));

import { finDeSesion, sesionPasoElMaximo, vencimientoDelRefresh, maxDiasSesion } from '../../src/application/use-cases/auth/vigenciaSesion';
import { RefreshAuth } from '../../src/application/use-cases/auth/RefreshAuth';
import { emitirSesion } from '../../src/application/use-cases/auth/emitirSesion';
import { ConservarSesionActual } from '../../src/application/use-cases/auth/ConservarSesionActual';
import { RefreshToken } from '../../src/domain/entities/Auth';
import { SesionMaximaVencidaException, UnauthorizedException } from '../../src/domain/exceptions/BaseException';
import { esClienteWeb, refreshParaElCuerpo, sinRefresh } from '../../src/interface/controllers/refreshCookie';

const DIA = 24 * 60 * 60 * 1000;
const hace = (dias: number) => new Date(Date.now() - dias * DIA);

describe('vigenciaSesion: el reloj absoluto', () => {
    test('SESION_MAX_DIAS sale del entorno (y 30 si un mock no la trae)', () => {
        expect(maxDiasSesion()).toBe(30);
        envMock.SESION_MAX_DIAS = undefined;
        expect(maxDiasSesion()).toBe(30);
        envMock.SESION_MAX_DIAS = 5;
        expect(maxDiasSesion()).toBe(5);
        envMock.SESION_MAX_DIAS = 30;
    });

    test('la sesión vence exactamente N días después del login', () => {
        const inicio = new Date('2026-01-01T12:00:00Z');
        expect(finDeSesion(inicio, 30).toISOString()).toBe('2026-01-31T12:00:00.000Z');
        expect(sesionPasoElMaximo(inicio, new Date('2026-01-31T11:59:59Z'), 30)).toBe(false);
        expect(sesionPasoElMaximo(inicio, new Date('2026-01-31T12:00:00Z'), 30)).toBe(true);
    });

    test('un refresh dura lo deslizante (7 días) salvo que la sesión termine antes', () => {
        const inicio = new Date('2026-01-01T00:00:00Z');
        // Al principio de la sesión: 7 días desde ahora.
        const temprano = new Date('2026-01-02T00:00:00Z');
        expect(vencimientoDelRefresh(inicio, temprano, 30).toISOString()).toBe('2026-01-09T00:00:00.000Z');
        // A 3 días del tope: el refresh no pasa del fin de la sesión.
        const tarde = new Date('2026-01-28T00:00:00Z');
        expect(vencimientoDelRefresh(inicio, tarde, 30).toISOString()).toBe('2026-01-31T00:00:00.000Z');
    });
});

/** Repo de refresh en memoria: lo justo para RefreshAuth / emitirSesion / ConservarSesionActual. */
function repoEnMemoria() {
    let id = 0;
    const filas: RefreshToken[] = [];
    const nueva = (d: { token: string; usuarioId: number; expiresAt: Date; familia: string; sesionIniciadaAt: Date; isRevoked?: boolean }) => {
        const r = new RefreshToken(++id, d.token, d.usuarioId, d.expiresAt, d.isRevoked ?? false, new Date(), d.familia, d.sesionIniciadaAt);
        filas.push(r);
        return r;
    };
    const repo = {
        filas,
        nueva,
        create: jest.fn(async (d: any) => nueva(d)),
        findByToken: jest.fn(async (t: string) => filas.find((f) => f.token === t) ?? null),
        update: jest.fn(),
        claimForRotation: jest.fn(async (fid: number) => {
            const i = filas.findIndex((f) => f.id === fid && !f.isRevoked);
            if (i < 0) return false;
            const f = filas[i];
            filas[i] = new RefreshToken(f.id, f.token, f.usuarioId, f.expiresAt, true, f.createdAt, f.familia, f.sesionIniciadaAt);
            return true;
        }),
        revokeAllForUser: jest.fn(),
        deleteByToken: jest.fn(),
        deleteAllForUser: jest.fn(async (uid: number) => {
            const antes = filas.length;
            for (let i = filas.length - 1; i >= 0; i--) if (filas[i].usuarioId === uid) filas.splice(i, 1);
            return antes - filas.length;
        }),
        deleteFamilia: jest.fn(async (fam: string) => {
            const antes = filas.length;
            for (let i = filas.length - 1; i >= 0; i--) if (filas[i].familia === fam) filas.splice(i, 1);
            return antes - filas.length;
        }),
        findVigenteDeFamilia: jest.fn(async (uid: number, fam: string) =>
            [...filas].reverse().find((f) => f.usuarioId === uid && f.familia === fam && !f.isRevoked && f.expiresAt > new Date()) ?? null),
    };
    return repo;
}

/** Token service de juguete: el "token" es el payload serializado; el hash, un prefijo. */
const tokenService = {
    generateAccessToken: jest.fn((p: any) => `access:${JSON.stringify(p)}:${Math.random()}`),
    generateRefreshToken: jest.fn((p: any) => `refresh:${JSON.stringify(p)}:${Math.random()}`),
    verifyRefreshToken: jest.fn((t: string) => JSON.parse(t.split(':').slice(1, -1).join(':'))),
    hashToken: (t: string) => `h(${t})`,
};

describe('RefreshAuth: familia heredada y vencimiento absoluto', () => {
    beforeEach(() => securityEventCreate.mockClear());

    test('rotar hereda familia e inicio, y el access nuevo nombra la misma sesión (sid)', async () => {
        const repo = repoEnMemoria();
        const sesion = await emitirSesion({ ...usuarioDb, nombre: 'V', email: 'v@x.com' }, tokenService, repo as any);
        const original = repo.filas[0];
        expect(original.familia).toEqual(expect.any(String));
        // El login abre la sesión: el access ya la nombra.
        expect(tokenService.generateAccessToken).toHaveBeenLastCalledWith(expect.objectContaining({ sid: original.familia }));

        const r = await new RefreshAuth(tokenService, repo as any).execute(sesion.tokens.refresh);
        const rotado = repo.filas.find((f) => f.token === tokenService.hashToken(r.refresh))!;
        expect(rotado.familia).toBe(original.familia);
        expect(rotado.sesionIniciadaAt).toEqual(original.sesionIniciadaAt);
        expect(tokenService.generateAccessToken).toHaveBeenLastCalledWith(expect.objectContaining({ sid: original.familia }));
    });

    test('pasado el máximo → SESION_MAXIMA_VENCIDA, se borra la familia y queda el evento', async () => {
        const repo = repoEnMemoria();
        const refresh = tokenService.generateRefreshToken({ userId: 7 });
        repo.nueva({ token: tokenService.hashToken(refresh), usuarioId: 7, expiresAt: new Date(Date.now() + DIA), familia: 'fam-vieja', sesionIniciadaAt: hace(31) });
        repo.nueva({ token: 'h(otra-rotada)', usuarioId: 7, expiresAt: hace(20), familia: 'fam-vieja', sesionIniciadaAt: hace(31), isRevoked: true });
        repo.nueva({ token: 'h(otra-sesion)', usuarioId: 7, expiresAt: new Date(Date.now() + DIA), familia: 'fam-nueva', sesionIniciadaAt: hace(1) });

        const uc = new RefreshAuth(tokenService, repo as any);
        const error = await uc.execute(refresh).catch((e) => e);
        expect(error).toBeInstanceOf(SesionMaximaVencidaException);
        expect(error.statusCode).toBe(401);
        expect(error.errorCode).toBe('SESION_MAXIMA_VENCIDA');
        expect(error.message).toMatch(/30 días/);

        // La familia vencida desaparece entera; la otra sesión del usuario no se toca.
        expect(repo.filas.map((f) => f.familia)).toEqual(['fam-nueva']);
        expect(securityEventCreate).toHaveBeenCalledTimes(1);
        expect(securityEventCreate.mock.calls[0][0].data).toMatchObject({ accion: 'sesion_vencida', usuarioId: 7 });

        // Reintentar con el mismo token: 401 genérico, sin otro evento.
        const otra = await uc.execute(refresh).catch((e) => e);
        expect(otra).toBeInstanceOf(UnauthorizedException);
        expect(otra).not.toBeInstanceOf(SesionMaximaVencidaException);
        expect(securityEventCreate).toHaveBeenCalledTimes(1);
    });

    test('a punto de vencer, la rotación no deja un refresh que pase del tope', async () => {
        const repo = repoEnMemoria();
        const refresh = tokenService.generateRefreshToken({ userId: 7 });
        const inicio = hace(28);
        repo.nueva({ token: tokenService.hashToken(refresh), usuarioId: 7, expiresAt: new Date(Date.now() + DIA), familia: 'f', sesionIniciadaAt: inicio });
        const r = await new RefreshAuth(tokenService, repo as any).execute(refresh);
        const rotado = repo.filas.find((f) => f.token === tokenService.hashToken(r.refresh))!;
        expect(rotado.expiresAt.getTime()).toBe(finDeSesion(inicio).getTime());
    });

    test('el reuso de un token rotado sigue ganándole al vencimiento absoluto', async () => {
        const repo = repoEnMemoria();
        const refresh = tokenService.generateRefreshToken({ userId: 7 });
        repo.nueva({ token: tokenService.hashToken(refresh), usuarioId: 7, expiresAt: new Date(Date.now() + DIA), familia: 'f', sesionIniciadaAt: hace(40), isRevoked: true });
        const error = await new RefreshAuth(tokenService, repo as any).execute(refresh).catch((e) => e);
        expect(error).not.toBeInstanceOf(SesionMaximaVencidaException);
        expect(repo.revokeAllForUser).toHaveBeenCalledWith(7);
        expect(securityEventCreate.mock.calls[0][0].data).toMatchObject({ accion: 'refresh_reuse' });
    });
});

describe('ConservarSesionActual (la web cambia SU contraseña)', () => {
    const payload = { userId: 7, concesionariaId: 3, sucursalId: null, roles: ['vendedor'], sid: 'fam' };

    test('si la operación cerró la sesión, emite otro refresh en la MISMA familia y con el MISMO inicio', async () => {
        const repo = repoEnMemoria();
        const inicio = hace(10);
        repo.nueva({ token: 'h(cookie)', usuarioId: 7, expiresAt: new Date(Date.now() + DIA), familia: 'fam', sesionIniciadaAt: inicio });
        const uc = new ConservarSesionActual(tokenService, repo as any);

        const captura = await uc.capturar(7, 'fam');
        expect(captura).toMatchObject({ familia: 'fam', sesionIniciadaAt: inicio });
        await repo.deleteAllForUser(7); // lo que hace ChangeMyPassword sin keepRefreshToken
        const nuevo = await uc.restaurar(captura, payload);

        expect(nuevo).toEqual(expect.any(String));
        expect(repo.filas).toHaveLength(1);
        expect(repo.filas[0]).toMatchObject({ familia: 'fam', sesionIniciadaAt: inicio, token: tokenService.hashToken(nuevo!) });
    });

    test('si la sesión sigue viva (no se cerró nada) no emite nada', async () => {
        const repo = repoEnMemoria();
        repo.nueva({ token: 'h(cookie)', usuarioId: 7, expiresAt: new Date(Date.now() + DIA), familia: 'fam', sesionIniciadaAt: hace(1) });
        const uc = new ConservarSesionActual(tokenService, repo as any);
        const captura = await uc.capturar(7, 'fam');
        expect(await uc.restaurar(captura, payload)).toBeNull();
        expect(repo.create).not.toHaveBeenCalled();
    });

    test('no resucita: sin sid, con la sesión ya muerta, ajena o pasada del máximo, no hay nada que conservar', async () => {
        const repo = repoEnMemoria();
        repo.nueva({ token: 'h(rotado)', usuarioId: 7, expiresAt: new Date(Date.now() + DIA), familia: 'muerta', sesionIniciadaAt: hace(1), isRevoked: true });
        repo.nueva({ token: 'h(ajena)', usuarioId: 8, expiresAt: new Date(Date.now() + DIA), familia: 'ajena', sesionIniciadaAt: hace(1) });
        repo.nueva({ token: 'h(vieja)', usuarioId: 7, expiresAt: new Date(Date.now() + DIA), familia: 'vieja', sesionIniciadaAt: hace(31) });
        const uc = new ConservarSesionActual(tokenService, repo as any);
        expect(await uc.capturar(7, undefined)).toBeNull();
        expect(await uc.capturar(7, 'muerta')).toBeNull();
        expect(await uc.capturar(7, 'ajena')).toBeNull();
        expect(await uc.capturar(7, 'vieja')).toBeNull();
        expect(await uc.restaurar(null, payload)).toBeNull();
    });
});

describe('refreshParaElCuerpo: quién recibe el refresh en el JSON', () => {
    const req = (headers: Record<string, string> = {}, body: unknown = undefined) => ({ headers, body }) as any;

    test('la web (X-Autenza-Cliente: web) nunca', () => {
        expect(esClienteWeb(req({ 'x-autenza-cliente': 'web' }))).toBe(true);
        expect(esClienteWeb(req({ 'x-autenza-cliente': ' WEB ' }))).toBe(true);
        expect(esClienteWeb(req({ 'x-autenza-cliente': 'movil' }))).toBe(false);
        expect(refreshParaElCuerpo(req({ 'x-autenza-cliente': 'web' }))).toBe(false);
        expect(refreshParaElCuerpo(req({ 'x-autenza-cliente': 'web' }, { refreshToken: 'r' }), { exigirQueVengaEnElCuerpo: true })).toBe(false);
    });

    test('sin la cabecera (app móvil): login sí; refresh sólo si el token vino en el cuerpo', () => {
        expect(refreshParaElCuerpo(req())).toBe(true);
        expect(refreshParaElCuerpo(req({}, { refreshToken: 'r' }), { exigirQueVengaEnElCuerpo: true })).toBe(true);
        // Renovó con la cookie (un navegador): el refresh no vuelve en el JSON aunque no mande la cabecera.
        expect(refreshParaElCuerpo(req({}, {}), { exigirQueVengaEnElCuerpo: true })).toBe(false);
        expect(refreshParaElCuerpo(req({}, { refreshToken: '' }), { exigirQueVengaEnElCuerpo: true })).toBe(false);
    });

    test('sinRefresh saca sólo el refresh', () => {
        expect(sinRefresh({ access: 'a', refresh: 'r' })).toEqual({ access: 'a' });
    });
});
