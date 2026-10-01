import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import ProtectedRoute from './ProtectedRoute';
import { useAuthStore } from '../../store/authStore';

const montar = (ruta: string) =>
    render(
        <MemoryRouter initialEntries={[ruta]}>
            <Routes>
                <Route path="/login" element={<div>pantalla login</div>} />
                <Route element={<ProtectedRoute />}>
                    <Route path="/activar-2fa" element={<div>activar 2fa</div>} />
                    <Route path="/ventas" element={<div>ventas</div>} />
                </Route>
            </Routes>
        </MemoryRouter>,
    );

const sesion = (mfaPendiente?: boolean) =>
    useAuthStore.setState({
        isAuthenticated: true,
        accessToken: 'a',
        refreshToken: 'r',
        user: { id: 1, nombre: 'N', email: 'e@x.com', roles: ['super_admin'], concesionariaId: null, sucursalId: null, mfaPendiente },
    });

describe('ProtectedRoute: 2FA obligatorio', () => {
    beforeEach(() => useAuthStore.getState().logout());

    it('sin sesión manda al login', () => {
        montar('/ventas');
        expect(screen.getByText('pantalla login')).toBeInTheDocument();
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
