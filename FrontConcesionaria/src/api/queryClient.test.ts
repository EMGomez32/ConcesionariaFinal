import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MutationObserver, QueryObserver } from '@tanstack/react-query';
import { queryClient } from './queryClient';
import { useUIStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';

const falla = (message = 'La sucursal es obligatoria') => () => Promise.reject({ error: 'VALIDATION_ERROR', message });

const mutar = async (opciones: ConstructorParameters<typeof MutationObserver>[1]) => {
    const obs = new MutationObserver(queryClient, opciones);
    await obs.mutate(undefined).catch(() => {});
};

const toasts = () => useUIStore.getState().toasts;

describe('queryClient: aviso global de errores sin doble toast', () => {
    beforeEach(() => {
        queryClient.clear();
        useUIStore.setState({ toasts: [] });
        useAuthStore.setState({
            user: { id: 1, nombre: 'N', email: 'e@x.com', roles: ['admin'], concesionariaId: 1, sucursalId: null },
            accessToken: 'a',
            isAuthenticated: true,
        });
    });

    it('una mutación SIN onError propio muestra el toast global (una vez)', async () => {
        await mutar({ mutationFn: falla() });
        expect(toasts()).toHaveLength(1);
        expect(toasts()[0]).toMatchObject({ type: 'error', message: 'La sucursal es obligatoria' });
    });

    it('una mutación CON onError propio no recibe además el toast global', async () => {
        const onError = vi.fn(() => useUIStore.getState().addToast('No se pudo guardar', 'error'));
        await mutar({ mutationFn: falla(), onError });
        expect(onError).toHaveBeenCalledTimes(1);
        expect(toasts().map((t) => t.message)).toEqual(['No se pudo guardar']);
    });

    it('meta.silenciarError apaga el toast global (para mutateAsync con try/catch)', async () => {
        await mutar({ mutationFn: falla(), meta: { silenciarError: true } });
        expect(toasts()).toHaveLength(0);
    });

    it('la sesión vencida no toastea (el cliente ya llevó al login)', async () => {
        await mutar({ mutationFn: () => Promise.reject({ error: 'SESION_VENCIDA', message: 'Tu sesión venció. Volvé a entrar.' }) });
        expect(toasts()).toHaveLength(0);
    });

    it('nunca muestra "Network Error": lo traduce', async () => {
        await mutar({ mutationFn: () => Promise.reject(new Error('Network Error')) });
        expect(toasts()[0].message).toBe('No hay conexión con el servidor. Revisá tu internet y probá de nuevo.');
    });

    it('una query que falla toastea, salvo con meta.silenciarError', async () => {
        const q1 = new QueryObserver(queryClient, { queryKey: ['x1'], queryFn: falla('No se pudo cargar'), retry: false });
        await q1.refetch();
        expect(toasts().map((t) => t.message)).toEqual(['No se pudo cargar']);

        useUIStore.setState({ toasts: [] });
        const q2 = new QueryObserver(queryClient, { queryKey: ['x2'], queryFn: falla(), retry: false, meta: { silenciarError: true } });
        await q2.refetch();
        expect(toasts()).toHaveLength(0);
    });

    it('los toasts de error duran al menos 6 s y los de éxito 3 s', () => {
        useUIStore.getState().addToast('Falló', 'error');
        useUIStore.getState().addToast('Listo', 'success');
        const [err, ok] = toasts();
        expect(err.duracion).toBeGreaterThanOrEqual(6000);
        expect(ok.duracion).toBe(3000);
    });
});
