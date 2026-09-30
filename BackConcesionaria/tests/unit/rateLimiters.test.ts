import express from 'express';
import request from 'supertest';

// Los limiters se saltean con NODE_ENV=test (para no interferir con la suite de
// integración), así que el CI nunca los ejercita. Acá se monta un Express real con
// env de "desarrollo" y se prueba el comportamiento de cada uno. Sin DB ni server.
jest.setTimeout(30000);
jest.mock('../../src/config/env', () => ({ env: { NODE_ENV: 'development' } }));

import {
    forgotPasswordEmailLimiter,
    forgotPasswordIpLimiter,
    loginAccountLimiter,
    loginLimiter,
    resetPasswordLimiter,
    uploadLimiter,
} from '../../src/interface/middlewares/rateLimiters';
import { minResponseTime } from '../../src/interface/middlewares/minResponseTime.middleware';
import { context } from '../../src/infrastructure/security/context';

// Una app nueva por test: los contadores viven en el store de cada limiter, que es
// un singleton del módulo; por eso cada test usa emails / IPs / usuarios propios.
function crearApp() {
    const app = express();
    app.use(express.json());
    // Login simulado: 401 salvo password "ok" (para probar skipSuccessfulRequests).
    app.post('/login', loginLimiter, loginAccountLimiter, (req, res) => {
        res.status(req.body.password === 'ok' ? 200 : 401).json({});
    });
    // forgot-password simulado: SIEMPRE 200, como el real.
    app.post('/forgot', forgotPasswordIpLimiter, forgotPasswordEmailLimiter, (_req, res) => res.json({ ok: true }));
    app.post('/reset', resetPasswordLimiter, (_req, res) => res.json({ ok: true }));
    // Por usuario: el "usuario" sale del header (simula context.getUser()).
    app.post('/upload', (req, _res, next) => {
        const uid = Number(req.headers['x-user']);
        context.run({ user: { userId: uid } } as any, () => next());
    }, uploadLimiter, (_req, res) => res.json({ ok: true }));
    app.get('/lento', minResponseTime(300), (_req, res) => res.json({ ok: true }));
    return app;
}

const post = (app: express.Express, url: string, body: object, ip: string, extra: Record<string, string> = {}) => {
    const r = request(app).post(url).set('CF-Connecting-IP', ip);
    Object.entries(extra).forEach(([k, v]) => r.set(k, v));
    return r.send(body);
};

describe('forgotPasswordEmailLimiter (email-bombing)', () => {
    test('el 4º pedido para el MISMO email da 429 aunque cambie la IP', async () => {
        const app = crearApp();
        const email = 'victima1@demo.com';
        for (let i = 1; i <= 3; i++) {
            expect((await post(app, '/forgot', { email }, `10.0.0.${i}`)).status).toBe(200);
        }
        expect((await post(app, '/forgot', { email }, '10.0.0.99')).status).toBe(429);
    });

    test('otro email no se ve afectado', async () => {
        const app = crearApp();
        for (let i = 0; i < 4; i++) await post(app, '/forgot', { email: 'victima2@demo.com' }, '10.1.0.1');
        expect((await post(app, '/forgot', { email: 'otra@demo.com' }, '10.1.0.2')).status).toBe(200);
    });

    test('el email se normaliza (mayúsculas/espacios no evaden el límite)', async () => {
        const app = crearApp();
        await post(app, '/forgot', { email: 'victima3@demo.com' }, '10.2.0.1');
        await post(app, '/forgot', { email: 'VICTIMA3@demo.com' }, '10.2.0.2');
        await post(app, '/forgot', { email: '  victima3@demo.com ' }, '10.2.0.3');
        expect((await post(app, '/forgot', { email: 'Victima3@Demo.com' }, '10.2.0.4')).status).toBe(429);
    });

    test('cuenta también las respuestas 200 (loginLimiter no lo hacía)', async () => {
        const app = crearApp();
        for (let i = 0; i < 3; i++) await post(app, '/forgot', { email: 'victima4@demo.com' }, '10.3.0.1');
        const r = await post(app, '/forgot', { email: 'victima4@demo.com' }, '10.3.0.1');
        expect(r.status).toBe(429);
        // El 429 no distingue si la cuenta existe: es por el texto del email.
        expect(r.body.error).toBe('TOO_MANY_REQUESTS');
    });
});

describe('forgotPasswordIpLimiter (barrido de emails)', () => {
    test('una IP que prueba muchos emails distintos se corta a las 20', async () => {
        const app = crearApp();
        for (let i = 0; i < 20; i++) {
            expect((await post(app, '/forgot', { email: `barrido${i}@demo.com` }, '10.4.0.1')).status).toBe(200);
        }
        expect((await post(app, '/forgot', { email: 'barrido21@demo.com' }, '10.4.0.1')).status).toBe(429);
    });
});

describe('loginAccountLimiter (ataque distribuido contra una cuenta)', () => {
    test('rotando IPs, a los 20 fallos la cuenta se bloquea', async () => {
        const app = crearApp();
        const body = { email: 'objetivo@demo.com', password: 'mal' };
        for (let i = 1; i <= 20; i++) {
            // Cada intento desde una IP distinta: loginLimiter (IP+email) nunca llega a 5.
            expect((await post(app, '/login', body, `20.0.${Math.floor(i / 200)}.${i}`)).status).toBe(401);
        }
        expect((await post(app, '/login', body, '20.9.9.9')).status).toBe(429);
    });

    test('los logins EXITOSOS no cuentan', async () => {
        const app = crearApp();
        const email = 'legitimo@demo.com';
        for (let i = 0; i < 30; i++) {
            expect((await post(app, '/login', { email, password: 'ok' }, '21.0.0.1')).status).toBe(200);
        }
    });

    test('loginLimiter sigue cortando 5 fallos desde la misma IP', async () => {
        const app = crearApp();
        const body = { email: 'unaip@demo.com', password: 'mal' };
        for (let i = 0; i < 5; i++) await post(app, '/login', body, '22.0.0.1');
        expect((await post(app, '/login', body, '22.0.0.1')).status).toBe(429);
    });
});

describe('resetPasswordLimiter', () => {
    test('11ª request desde la misma IP → 429', async () => {
        const app = crearApp();
        for (let i = 0; i < 10; i++) expect((await post(app, '/reset', { token: 'x' }, '30.0.0.1')).status).toBe(200);
        expect((await post(app, '/reset', { token: 'x' }, '30.0.0.1')).status).toBe(429);
    });
});

describe('limiters por usuario (uploads, envíos, PDFs)', () => {
    test('se cuenta por usuario, no por IP: dos usuarios tras la misma IP no se pisan', async () => {
        const app = crearApp();
        for (let i = 0; i < 100; i++) {
            expect((await post(app, '/upload', {}, '40.0.0.1', { 'x-user': '501' })).status).toBe(200);
        }
        expect((await post(app, '/upload', {}, '40.0.0.1', { 'x-user': '501' })).status).toBe(429);
        // Otro usuario desde la MISMA IP (una oficina) sigue pudiendo subir.
        expect((await post(app, '/upload', {}, '40.0.0.1', { 'x-user': '502' })).status).toBe(200);
    });

    test('el mismo usuario desde otra IP comparte el contador', async () => {
        const app = crearApp();
        for (let i = 0; i < 100; i++) await post(app, '/upload', {}, `41.0.0.${(i % 200) + 1}`, { 'x-user': '601' });
        expect((await post(app, '/upload', {}, '41.9.9.9', { 'x-user': '601' })).status).toBe(429);
    });
});

describe('minResponseTime', () => {
    test('demora la respuesta hasta el piso configurado', async () => {
        const app = crearApp();
        const t0 = Date.now();
        const r = await request(app).get('/lento');
        expect(r.status).toBe(200);
        expect(r.body).toEqual({ ok: true });
        expect(Date.now() - t0).toBeGreaterThanOrEqual(280);
    });
});
