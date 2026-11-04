import { render, screen } from '@testing-library/react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ResetPasswordPage from './ResetPasswordPage';

vi.mock('../../api/client', () => ({ default: { post: vi.fn() } }));

describe('ResetPasswordPage', () => {
    afterEach(() => window.history.replaceState(null, '', '/'));

    it('lee el token y lo borra de la barra de direcciones (sin perder el formulario)', () => {
        window.history.pushState({}, '', '/reset-password?token=llave-secreta-123&otro=1');
        render(
            <BrowserRouter>
                <Routes>
                    <Route path="/reset-password" element={<ResetPasswordPage />} />
                </Routes>
            </BrowserRouter>,
        );
        expect(window.location.search).not.toContain('llave-secreta-123');
        expect(window.location.search).toBe('?otro=1');
        expect(window.location.pathname).toBe('/reset-password');
        // El token quedó en memoria: se muestra el formulario, no el "Enlace inválido".
        expect(screen.queryByText(/Falta el token/)).toBeNull();
    });
});
