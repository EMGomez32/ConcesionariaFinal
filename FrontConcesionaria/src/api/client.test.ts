import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios, { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import client, { restaurarSesion } from './client';
import { useAuthStore } from '../store/authStore';
import { leerAvisoLogin, leerRegreso } from '../store/sesion';
import { MENSAJES_ERROR } from '../utils/getErrorMessage';

const USUARIO = { id: 7, nombre: 'Vera', email: 'v@x.com', roles: ['vendedor'], concesionariaId: 1, sucursalId: null };

/** JWT de juguete con el payload pedido (la firma no se verifica en el front). */
const jwt = (payload: object) => `x.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.y`;

const respuesta = (config: InternalAxiosRequestConfig, status: number, data: unknown) => {
    const res = { status, statusText: '', data, headers: {}, config };
    if (status >= 400) throw new AxiosError('Request failed with status code ' + status, 'ERR_BAD_RESPONSE', config, undefined, res);
    return res;
};

describe('client: errores normalizados en español', () => {
    it('sin conexión → NETWORK_ERROR con el mensaje de red (nunca "Network Error")', async () => {
        const adapter: AxiosAdapter = async (config) => { throw new AxiosError('Network Error', 'ERR_NETWORK', config); };
        await expect(client.get('/x', { adapter })).rejects.toEqual({ error: 'NETWORK_ERROR', message: MENSAJES_ERROR.red });
    });

    it('timeout → TIMEOUT', async () => {
        const adapter: AxiosAdapter = async (config) => { throw new AxiosError('timeout of 60000ms exceeded', 'ECONNABORTED', config); };
        await expect(client.get('/x', { adapter })).rejects.toMatchObject({ error: 'TIMEOUT', message: MENSAJES_ERROR.timeout });
    });

    it('502 con el HTML del proxy → mensaje de servidor no disponible', async () => {
        const adapter: AxiosAdapter = async (config) => respuesta(config, 502, '<html><body><h1>502 Bad Gateway</h1></body></html>');
        await expect(client.get('/x', { adapter })).rejects.toEqual({ error: 'HTTP_502', message: MENSAJES_ERROR.noDisponible, status: 502 });
    });

    it('el 500 genérico del backend se reemplaza; los demás mensajes se respetan con su código', async () => {
        const a500: AxiosAdapter = async (config) => respuesta(config, 500, { error: 'INTERNAL_SERVER_ERROR', message: 'Ha ocurrido un error inesperado.' });
        await expect(client.get('/x', { adapter: a500 })).rejects.toMatchObject({ error: 'INTERNAL_SERVER_ERROR', message: MENSAJES_ERROR.servidor, status: 500 });
        const a409: AxiosAdapter = async (config) => respuesta(config, 409, { error: 'CONFLICT', message: 'Ya existe', details: { campo: 'dni' } });
        await expect(client.get('/x', { adapter: a409 })).rejects.toEqual({ error: 'CONFLICT', message: 'Ya existe', details: { campo: 'dni' }, status: 409 });
    });

    it('la cancelación pasa tal cual (React Query la reconoce)', async () => {
        const adapter: AxiosAdapter = async () => { throw new axios.CanceledError('canceled'); };
        await expect(client.get('/x', { adapter })).rejects.toBeInstanceOf(axios.CanceledError);
    });
});

describe('client: refresh con cookie (sin tokens en localStorage)', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        useAuthStore.setState({ user: USUARIO, accessToken: 'viejo', refreshToken: null, isAuthenticated: true });
    });
    afterEach(() => vi.restoreAllMocks());

    it('ante un 401 renueva UNA vez (single-flight) con cuerpo vacío + cookie y reintenta', async () => {
        const nuevo = jwt({ userId: 7 });
        const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access: nuevo, refresh: 'r2' } });
        const vistos: string[] = [];
        const adapter: AxiosAdapter = async (config) => {
            const auth = String(new AxiosHeaders(config.headers).get('Authorization'));
            vistos.push(auth);
            return auth === `Bearer ${nuevo}` ? respuesta(config, 200, { ok: true }) : respuesta(config, 401, { error: 'UNAUTHORIZED', message: 'Token vencido' });
        };
        const [a, b] = await Promise.all([client.get('/a', { adapter }), client.get('/b', { adapter })]);
        expect(a).toEqual({ ok: true });
        expect(b).toEqual({ ok: true });
        expect(post).toHaveBeenCalledTimes(1);
        const [url, body, cfg] = post.mock.calls[0];
        expect(url).toMatch(/\/auth\/refresh$/);
        expect(body).toEqual({});
        expect(cfg).toMatchObject({ withCredentials: true });
        expect(useAuthStore.getState().accessToken).toBe(nuevo);
        // Nada de tokens en el storage: sólo el usuario.
        expect(JSON.parse(localStorage.getItem('auth-storage') ?? '{}').state).toEqual({ user: USUARIO });
    });

    it('un 401 del login (credenciales) no dispara el refresh', async () => {
        const post = vi.spyOn(axios, 'post');
        const adapter: AxiosAdapter = async (config) => respuesta(config, 401, { error: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas' });
        await expect(client.post('/auth/login', {}, { adapter })).rejects.toMatchObject({ message: 'Credenciales inválidas' });
        expect(post).not.toHaveBeenCalled();
    });

    it('si el refresh falla por red, la sesión NO se cierra', async () => {
        useAuthStore.setState({ accessToken: null, isAuthenticated: false });
        vi.spyOn(axios, 'post').mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
        await expect(restaurarSesion()).resolves.toBe('sin-conexion');
        expect(useAuthStore.getState().user).toEqual(USUARIO);
    });

    it('si el backend rechaza la cookie: sesión limpia, aviso y ruta de regreso', async () => {
        useAuthStore.setState({ accessToken: null, isAuthenticated: false });
        window.history.pushState({}, '', '/ventas?pagina=3');
        const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
        vi.spyOn(axios, 'post').mockRejectedValue(
            new AxiosError('Request failed with status code 401', 'ERR_BAD_REQUEST', config, undefined, {
                status: 401, statusText: '', data: {}, headers: {}, config,
            }),
        );
        await expect(restaurarSesion()).resolves.toBe('vencida');
        expect(useAuthStore.getState().user).toBeNull();
        expect(leerAvisoLogin()).toBe('sesion-vencida');
        expect(leerRegreso()).toBe('/ventas?pagina=3');
        window.history.pushState({}, '', '/');
    });
});
