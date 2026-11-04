import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import Input from './Input';
import Select from './Select';
import Textarea from './Textarea';

describe('Input / Select / Textarea: etiqueta asociada sin pasar id', () => {
    it('Input sin id: la etiqueta nombra al campo y el clic en la etiqueta lo enfoca', async () => {
        render(<Input label="Nombre" />);
        const campo = screen.getByLabelText('Nombre');
        expect(campo.tagName).toBe('INPUT');
        expect(campo.id).not.toBe('');
        await userEvent.click(screen.getByText('Nombre'));
        expect(campo).toHaveFocus();
    });

    it('dos Input sin id reciben ids distintos', () => {
        render(<><Input label="Nombre" /><Input label="Apellido" /></>);
        expect(screen.getByLabelText('Nombre').id).not.toBe(screen.getByLabelText('Apellido').id);
    });

    it('respeta el id que pase la página', () => {
        render(<Input label="Email" id="email-x" />);
        expect(screen.getByLabelText('Email')).toHaveAttribute('id', 'email-x');
    });

    it('el error queda conectado con aria-describedby y aria-invalid', () => {
        render(<Input label="DNI" error="El DNI es obligatorio" />);
        const campo = screen.getByLabelText('DNI');
        expect(campo).toHaveAttribute('aria-invalid', 'true');
        expect(campo).toHaveAccessibleDescription('El DNI es obligatorio');
    });

    it('la ayuda también se lee como descripción; sin error no hay aria-invalid', () => {
        render(<Input label="Teléfono" hint="Con código de área" aria-describedby="extra" />);
        const campo = screen.getByLabelText('Teléfono');
        expect(campo).not.toHaveAttribute('aria-invalid');
        expect(campo.getAttribute('aria-describedby')).toContain('extra');
        expect(campo.getAttribute('aria-describedby')).toContain(`${campo.id}-mensaje`);
    });

    it('Select sin id queda asociado y su placeholder por defecto está en voseo', () => {
        render(<Select label="Sucursal" options={[{ value: 1, label: 'Centro' }]} error="La sucursal es obligatoria" />);
        const campo = screen.getByLabelText('Sucursal');
        expect(campo.tagName).toBe('SELECT');
        expect(campo).toHaveAccessibleDescription('La sucursal es obligatoria');
        expect(screen.getByRole('option', { name: 'Elegí una opción' })).toBeInTheDocument();
    });

    it('Textarea sin id queda asociado', async () => {
        render(<Textarea label="Observaciones" />);
        const campo = screen.getByLabelText('Observaciones');
        expect(campo.tagName).toBe('TEXTAREA');
        await userEvent.click(screen.getByText('Observaciones'));
        expect(campo).toHaveFocus();
    });
});
