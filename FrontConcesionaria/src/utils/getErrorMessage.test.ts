import { describe, expect, it } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { getErrorMessage, MENSAJES_ERROR } from './getErrorMessage';
import { getApiErrorMessage } from './error';

const conRespuesta = (status: number, data: unknown) =>
    new AxiosError('Request failed with status code ' + status, 'ERR_BAD_RESPONSE', undefined, undefined, {
        status, statusText: '', data, headers: {}, config: { headers: new AxiosHeaders() },
    });

describe('getErrorMessage: nada técnico ni en inglés llega a la pantalla', () => {
    it('"Network Error" (string, Error o { message }) → mensaje de red en español', () => {
        expect(getErrorMessage('Network Error')).toBe(MENSAJES_ERROR.red);
        expect(getErrorMessage(new Error('Network Error'))).toBe(MENSAJES_ERROR.red);
        expect(getErrorMessage({ message: 'Network Error' })).toBe(MENSAJES_ERROR.red);
    });

    it('AxiosError sin respuesta → red; con timeout → timeout', () => {
        expect(getErrorMessage(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(MENSAJES_ERROR.red);
        expect(getErrorMessage(new AxiosError('timeout of 60000ms exceeded', 'ECONNABORTED'))).toBe(MENSAJES_ERROR.timeout);
    });

    it('el HTML de una página de error del proxy nunca se muestra', () => {
        const html = '<html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center></body></html>';
        expect(getErrorMessage(html)).toBe(MENSAJES_ERROR.servidor);
        expect(getErrorMessage(conRespuesta(502, html))).toBe(MENSAJES_ERROR.noDisponible);
    });

    it('5xx sin mensaje → genérico en español', () => {
        expect(getErrorMessage(conRespuesta(500, ''))).toBe(MENSAJES_ERROR.servidor);
    });

    it('respeta el mensaje del backend', () => {
        expect(getErrorMessage({ error: 'CONFLICT', message: 'Ya existe un cliente con ese DNI' })).toBe('Ya existe un cliente con ese DNI');
        expect(getErrorMessage(conRespuesta(400, { message: 'La sucursal es obligatoria' }))).toBe('La sucursal es obligatoria');
    });

    it('getApiErrorMessage comparte la limpieza y acepta la forma vieja { error: { message } }', () => {
        expect(getApiErrorMessage('Network Error')).toBe(MENSAJES_ERROR.red);
        expect(getApiErrorMessage({ error: { message: 'Credenciales inválidas' } })).toBe('Credenciales inválidas');
        expect(getApiErrorMessage(null, 'Fallback')).toBe('Fallback');
    });
});
