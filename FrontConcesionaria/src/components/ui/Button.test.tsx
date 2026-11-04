import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Button from './Button';

describe('Button Component', () => {
    it('renders the button with children', () => {
        render(<Button>Click Me</Button>);
        expect(screen.getByText('Click Me')).toBeInTheDocument();
    });

    it('handles click events', () => {
        const handleClick = vi.fn();
        render(<Button onClick={handleClick}>Click Me</Button>);
        fireEvent.click(screen.getByText('Click Me'));
        expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('en loading conserva su texto (no dice "Cargando...") y se deshabilita', () => {
        render(<Button loading>Guardar</Button>);
        const boton = screen.getByRole('button', { name: 'Guardar' });
        expect(boton).toBeDisabled();
        expect(boton).toHaveAttribute('aria-busy', 'true');
        expect(screen.queryByText('Cargando...')).not.toBeInTheDocument();
    });

    it('en loading usa loadingText si se pasa', () => {
        render(<Button loading loadingText="Guardando…">Guardar</Button>);
        expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    });

    it('is disabled when the disabled prop is true', () => {
        render(<Button disabled>Disabled</Button>);
        expect(screen.getByRole('button')).toBeDisabled();
    });

    it('applies the correct variant class', () => {
        const { container } = render(<Button variant="danger">Danger</Button>);
        expect(container.firstChild).toHaveClass('btn-danger');
    });
});
