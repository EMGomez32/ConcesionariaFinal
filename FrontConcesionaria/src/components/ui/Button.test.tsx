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

    it('displays loading state and disables the button', () => {
        render(<Button loading>Submit</Button>);
        expect(screen.getByText('Cargando...')).toBeInTheDocument();
        expect(screen.getByRole('button')).toBeDisabled();
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
