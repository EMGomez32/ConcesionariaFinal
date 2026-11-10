import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProtectedRoute from './ProtectedRoute';
import { useAuthStore } from '../../store/authStore';

const restaurarSesion = vi.fn();
vi.mock('../../api/client', () => ({
    restaurarSesion: () => restaurarSesion(),
    default: {},
}));

const Login = () => {
    const location = useLocation();
    const from = (location.state as { from?: string } | null)?.from;
    return <div>pantalla login{from ? ` desde ${from}` : ''}</div>;
};

const montar = (ruta: string) =>
    render(
        <MemoryRouter initialEntries={[ruta]}>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route element={<ProtectedRoute />}>
                    <Route path="/activar-2fa" element={<div>activar 2fa</div>} />
                    <Route path="/ventas" element={<div>ventas</div>} />
                </Route>
            </Routes>
        </MemoryRouter>,
    );

const USUARIO = (mfaPendiente?: boolean) => ({
    id: 1, nombre: 'N', email: 'e@x.com', roles: ['super_admin'], concesionariaId: null, sucursalId: null, mfaPendiente,
});

const sesion = (mfaPendiente?: boolean) =>
    useAuthStore.setState({
        isAuthenticated: true,
        accessToken: 'a',
        user: USUARIO(mfaPendiente),
    });

describe('ProtectedRoute: 2FA obligatorio', () => {
    beforeEach(() => {
        useAuthStore.getState().logout();
        restaurarSesion.mockReset();
    });

    it('sin sesión manda al login (recordando adónde iba)', () => {
        montar('/ventas?pagina=2');
        expect(screen.getByText('pantalla login desde /ventas?pagina=2')).toBeInTheDocument();
    });

    it('una sesión normal ve las pantallas', () => {
        sesion(false);
        montar('/ventas');
        expect(screen.getByText('ventas')).toBeInTheDocument();
    });

    it('con mfaPendiente queda CONFINADA a la pantalla de activación', () => {
        sesion(true);
        montar('/ventas');
        expect(screen.queryByText('ventas')).not.toBeInTheDocument();
        expect(screen.getByText('activar 2fa')).toBeInTheDocument();
    });

    it('con mfaPendiente la pantalla de activación sí se ve (no entra en bucle)', () => {
        sesion(true);
        montar('/activar-2fa');
        expect(screen.getByText('activar 2fa')).toBeInTheDocument();
    });
});

describe('ProtectedRoute: restaurar la sesión al recargar (access token en memoria)', () => {
    beforeEach(() => {
        useAuthStore.getState().logout();
        restaurarSesion.mockReset();
    });

    it('usuario persistido sin token: muestra el loader y restaura con la cookie', async () => {
        useAuthStore.setState({ user: USUARIO(false), accessToken: null, isAuthenticated: false });
        let terminar: () => void = () => {};
        restaurarSesion.mockImplementation(() => new Promise((resolve) => {
            terminar = () => {
                useAuthStore.getState().setAccessToken('nuevo');
                resolve('ok');
            };
        }));
        montar('/ventas');
        expect(screen.getByText('Recuperando tu sesión…')).toBeInTheDocument();
        expect(screen.queryByText('ventas')).not.toBeInTheDocument();
        act(() => terminar());
        expect(await screen.findByText('ventas')).toBeInTheDocument();
        expect(restaurarSesion).toHaveBeenCalled();
    });

    it('si el backend rechaza la cookie, va al login', async () => {
        useAuthStore.setState({ user: USUARIO(false), accessToken: null, isAuthenticated: false });
        restaurarSesion.mockImplementation(async () => {
            useAuthStore.getState().logout();
            return 'vencida';
        });
        montar('/ventas');
        expect(await screen.findByText(/pantalla login/)).toBeInTheDocument();
    });

    it('sin conexión no cierra la sesión: ofrece reintentar', async () => {
        useAuthStore.setState({ user: USUARIO(false), accessToken: null, isAuthenticated: false });
        restaurarSesion.mockResolvedValue('sin-conexion');
        montar('/ventas');
        expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
        expect(useAuthStore.getState().user).not.toBeNull();
    });
});
