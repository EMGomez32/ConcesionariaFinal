import { describe, it, expect } from 'vitest';
import { accionAuditoriaLabel, cuandoAuditoria, entidadAuditoriaLabel, fraseAuditoria } from './auditoriaTextos';

describe('fraseAuditoria', () => {
    it('convierte acción + entidad en una frase en español', () => {
        expect(fraseAuditoria({ accion: 'create', entidad: 'Vehiculo' })).toBe('Creó un vehículo');
        expect(fraseAuditoria({ accion: 'update', entidad: 'Venta' })).toBe('Editó una venta');
        expect(fraseAuditoria({ accion: 'delete_soft', entidad: 'Cliente' })).toBe('Dio de baja un cliente');
    });

    it('los eventos de sesión no muestran la entidad cruda', () => {
        expect(fraseAuditoria({ accion: 'login_fail' as never, entidad: 'Usuario' })).toBe('Intento de ingreso fallido');
        expect(fraseAuditoria({ accion: 'login', entidad: 'Usuario' })).toBe('Inició sesión');
    });

    it('una entidad o acción desconocida nunca sale cruda', () => {
        expect(entidadAuditoriaLabel('AlgoNuevo')).toBe('Algo nuevo');
        expect(accionAuditoriaLabel('algo_raro')).toBe('Algo raro');
        expect(fraseAuditoria({ accion: 'create', entidad: 'AlgoNuevo' })).toBe('Creó un registro de algo nuevo');
    });
});

describe('cuandoAuditoria', () => {
    const ahora = new Date(2026, 10, 3, 18, 0);

    it('muestra "Hoy" y "Ayer" con la hora en 24 h', () => {
        expect(cuandoAuditoria(new Date(2026, 10, 3, 14, 32).toISOString(), ahora)).toBe('Hoy 14:32');
        expect(cuandoAuditoria(new Date(2026, 10, 2, 9, 5).toISOString(), ahora)).toBe('Ayer 09:05');
    });

    it('para días anteriores muestra la fecha además de la hora', () => {
        expect(cuandoAuditoria(new Date(2026, 9, 28, 14, 32).toISOString(), ahora)).toBe('28/10 14:32');
        expect(cuandoAuditoria(new Date(2025, 9, 28, 14, 32).toISOString(), ahora)).toBe('28/10/2025 14:32');
    });
});
