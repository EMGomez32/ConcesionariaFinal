// Unit tests PUROS (sin DB): piezas del rastro de seguridad.
jest.mock('../../src/infrastructure/database/prisma', () => ({
    rawPrisma: { securityEvent: { create: jest.fn() } },
}));
jest.mock('../../src/infrastructure/logging/logger', () => ({
    logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import { rawPrisma } from '../../src/infrastructure/database/prisma';
import { logger } from '../../src/infrastructure/logging/logger';
import { hashEmail, recordSecurityEvent } from '../../src/infrastructure/security/securityEvents';
import { DetectorFuerzaBruta, VentanaDeUso } from '../../src/infrastructure/security/ventanaDeuso';
import { clasificar } from '../../src/interface/middlewares/authEvents.middleware';
import { detalleCambioDeRoles, detalleUpdate, nombresDeRoles } from '../../src/interface/controllers/usuarioAuditoria';

const crear = (rawPrisma as any).securityEvent.create as jest.Mock;

describe('securityEvents', () => {
    beforeEach(() => { crear.mockReset(); crear.mockResolvedValue({}); });

    test('hashEmail: estable, normaliza mayúsculas/espacios y no contiene el email', () => {
        const h = hashEmail('  Usuario@Demo.COM ');
        expect(h).toBe(hashEmail('usuario@demo.com'));
        expect(h).toHaveLength(32);
        expect(h).not.toContain('usuario');
    });

    test('guarda el HASH del email, nunca el email', async () => {
        await recordSecurityEvent({ accion: 'login_fail', email: 'victima@demo.com', ip: '1.2.3.4' });
        const data = crear.mock.calls[0][0].data;
        expect(data.emailHash).toBe(hashEmail('victima@demo.com'));
        expect(JSON.stringify(data)).not.toContain('victima@demo.com');
        expect(data.accion).toBe('login_fail');
    });

    test('recorta campos largos (detalle, user agent)', async () => {
        await recordSecurityEvent({ accion: 'x', detalle: 'a'.repeat(5000), userAgent: 'b'.repeat(1000) });
        const data = crear.mock.calls[0][0].data;
        expect(data.detalle).toHaveLength(1000);
        expect(data.userAgent).toHaveLength(255);
    });

    test('NUNCA lanza: si la escritura falla, sólo loguea', async () => {
        crear.mockRejectedValue(new Error('db caída'));
        await expect(recordSecurityEvent({ accion: 'login_fail' })).resolves.toBeUndefined();
        expect(logger.error).toHaveBeenCalled();
    });
});

describe('VentanaDeUso / DetectorFuerzaBruta', () => {
    test('cuenta sólo lo que cae dentro de la ventana', () => {
        let t = 0;
        const v = new VentanaDeUso(1000, 100, () => t);
        expect(v.registrar('a')).toBe(1);
        t = 500; expect(v.registrar('a')).toBe(2);
        t = 1200; expect(v.registrar('a')).toBe(2); // el de t=0 ya salió de la ventana
    });

    test('claves distintas no se mezclan', () => {
        const v = new VentanaDeUso(1000);
        v.registrar('a'); v.registrar('a');
        expect(v.registrar('b')).toBe(1);
    });

    test('no crece sin límite ante un barrido de claves', () => {
        const v = new VentanaDeUso(60_000, 50);
        for (let i = 0; i < 500; i++) v.registrar(`k${i}`);
        expect((v as any).eventos.size).toBeLessThanOrEqual(50);
    });

    test('alerta UNA sola vez al cruzar el umbral de la cuenta (no en cada intento)', () => {
        const d = new DetectorFuerzaBruta(5, 100);
        const resultados = Array.from({ length: 8 }, () => d.fallo('cuenta-x', 'ip-y'));
        expect(resultados.map((r) => r.length)).toEqual([0, 0, 0, 0, 1, 0, 0, 0]);
        expect(resultados[4]).toEqual(['cuenta']);
    });

    test('alerta por IP cuando una IP prueba muchas cuentas distintas', () => {
        const d = new DetectorFuerzaBruta(5, 10);
        let ultimo: string[] = [];
        for (let i = 0; i < 10; i++) ultimo = d.fallo(`cuenta-${i}`, 'ip-atacante');
        expect(ultimo).toEqual(['ip']);
    });

    test('la racha vieja no cuenta: pasada la ventana empieza de cero', () => {
        let t = 0;
        const d = new DetectorFuerzaBruta(3, 100, 1000, () => t);
        d.fallo('c', null); d.fallo('c', null);
        t = 5000;
        expect(d.fallo('c', null)).toEqual([]);
    });
});

describe('authEvents.clasificar', () => {
    test.each([
        ['/login', 401, 'login_fail'],
        ['/login', 403, 'login_fail'],
        ['/login', 429, 'login_bloqueado'],
        ['/login', 200, null],
        ['/forgot-password', 200, 'reset_pedido'],
        ['/forgot-password', 429, null],
        ['/reset-password', 200, 'reset_hecho'],
        ['/reset-password', 400, null],
        ['/refresh', 401, null],
        ['/logout', 200, null],
    ])('%s %i → %s', (path, status, esperado) => {
        expect(clasificar(path as string, status as number)).toBe(esperado);
    });
});

describe('usuarioAuditoria', () => {
    const conRoles = (...nombres: string[]) => ({ roles: nombres.map((n) => ({ rol: { nombre: n } })) });

    test('nombresDeRoles: ordena e ignora roles dados de baja', () => {
        const u = { roles: [{ rol: { nombre: 'vendedor' } }, { rol: { nombre: 'admin' } }, { deletedAt: new Date(), rol: { nombre: 'lectura' } }] };
        expect(nombresDeRoles(u)).toEqual(['admin', 'vendedor']);
        expect(nombresDeRoles(null)).toEqual([]);
        expect(nombresDeRoles({})).toEqual([]);
    });

    test('sin cambio de roles no hay detalle de roles', () => {
        expect(detalleCambioDeRoles(['admin'], ['admin'])).toBeNull();
    });

    test('un cambio de roles dice antes → después', () => {
        expect(detalleCambioDeRoles(['vendedor'], ['admin', 'vendedor'])).toBe('Roles: [vendedor] → [admin, vendedor]');
        expect(detalleCambioDeRoles(['admin'], [])).toBe('Roles: [admin] → [sin roles]');
    });

    test('otorgar super_admin queda marcado', () => {
        expect(detalleCambioDeRoles(['admin'], ['super_admin'])).toContain('SE OTORGÓ super_admin');
        // Mantenerlo no es "otorgar".
        expect(detalleCambioDeRoles(['super_admin'], ['super_admin', 'admin'])).not.toContain('SE OTORGÓ');
    });

    test('detalleUpdate incluye roles, estado y email; sin cambios queda el texto de siempre', () => {
        const antes = { ...conRoles('vendedor'), activo: true, email: 'a@x.com' };
        const despues = { ...conRoles('admin'), activo: false, email: 'b@x.com' };
        const d = detalleUpdate('Ana', antes, despues);
        expect(d).toContain('Roles: [vendedor] → [admin]');
        expect(d).toContain('Estado: activo → inactivo');
        expect(d).toContain('Email modificado');
        expect(d).not.toContain('a@x.com'); // no se copian direcciones al texto
        expect(detalleUpdate('Ana', antes, antes)).toBe('Usuario Ana actualizado');
    });
});
