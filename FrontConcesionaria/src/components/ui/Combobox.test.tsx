import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import Combobox, { type ComboboxOption } from './Combobox';

const CLIENTES: ComboboxOption[] = [
    { value: 1, label: 'José Pérez', sub: 'DNI 30.111.222' },
    { value: 2, label: 'María Gómez', sub: 'DNI 28.333.444' },
    { value: 3, label: 'Juan Díaz', sub: 'DNI 35.555.666', disabled: true },
];

function Controlado(props: Partial<React.ComponentProps<typeof Combobox>> & { inicial?: number | null; alCambiar?: (v: unknown) => void }) {
    const { inicial = null, alCambiar, ...resto } = props;
    const [valor, setValor] = useState<string | number | null>(inicial);
    return (
        <Combobox
            label="Cliente"
            options={CLIENTES}
            value={valor}
            onChange={(v) => { setValor(v); alCambiar?.(v); }}
            {...resto}
        />
    );
}

describe('Combobox', () => {
    it('la etiqueta nombra al combobox y la lista arranca cerrada', () => {
        render(<Controlado />);
        const cbx = screen.getByRole('combobox', { name: 'Cliente' });
        expect(cbx).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('filtra sin importar tildes ni mayúsculas, también por el texto secundario', async () => {
        const user = userEvent.setup();
        render(<Controlado />);
        const cbx = screen.getByRole('combobox', { name: 'Cliente' });
        await user.type(cbx, 'jose');
        expect(screen.getAllByRole('option')).toHaveLength(1);
        expect(screen.getByRole('option', { name: /José Pérez/ })).toBeInTheDocument();
        await user.clear(cbx);
        await user.type(cbx, '28.333');
        expect(screen.getByRole('option', { name: /María Gómez/ })).toBeInTheDocument();
    });

    it('muestra el texto secundario de cada opción', async () => {
        const user = userEvent.setup();
        render(<Controlado />);
        await user.click(screen.getByRole('combobox', { name: 'Cliente' }));
        expect(screen.getByText('DNI 28.333.444')).toBeInTheDocument();
    });

    it('flechas + Enter eligen; la lista se cierra y el input muestra la elegida', async () => {
        const user = userEvent.setup();
        const alCambiar = vi.fn();
        render(<Controlado alCambiar={alCambiar} />);
        const cbx = screen.getByRole('combobox', { name: 'Cliente' });
        cbx.focus();
        await user.keyboard('{ArrowDown}');
        expect(cbx).toHaveAttribute('aria-expanded', 'true');
        await user.keyboard('{ArrowDown}');
        const marcada = screen.getByRole('option', { name: /María Gómez/ });
        expect(cbx).toHaveAttribute('aria-activedescendant', marcada.id);
        await user.keyboard('{Enter}');
        expect(alCambiar).toHaveBeenCalledWith(2);
        expect(cbx).toHaveValue('María Gómez');
        expect(cbx).toHaveAttribute('aria-expanded', 'false');
    });

    it('las flechas saltean las opciones deshabilitadas', async () => {
        const user = userEvent.setup();
        render(<Controlado />);
        const cbx = screen.getByRole('combobox', { name: 'Cliente' });
        cbx.focus();
        await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
        // Quedó en María (la 3ra, Juan, está deshabilitada).
        expect(cbx).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: /María Gómez/ }).id);
    });

    it('tipear + Enter elige la primera coincidencia', async () => {
        const user = userEvent.setup();
        const alCambiar = vi.fn();
        render(<Controlado alCambiar={alCambiar} />);
        await user.type(screen.getByRole('combobox', { name: 'Cliente' }), 'mar{Enter}');
        expect(alCambiar).toHaveBeenCalledWith(2);
    });

    it('Escape cierra la lista sin cambiar el valor y sin dejar pasar la tecla', async () => {
        const user = userEvent.setup();
        const alCambiar = vi.fn();
        const afuera = vi.fn();
        render(
            <div onKeyDown={(e) => { if (e.key === 'Escape') afuera(); }}>
                <Controlado inicial={1} alCambiar={alCambiar} />
            </div>,
        );
        const cbx = screen.getByRole('combobox', { name: 'Cliente' });
        await user.type(cbx, 'xx');
        expect(cbx).toHaveAttribute('aria-expanded', 'true');
        await user.keyboard('{Escape}');
        expect(cbx).toHaveAttribute('aria-expanded', 'false');
        expect(cbx).toHaveValue('José Pérez');
        expect(alCambiar).not.toHaveBeenCalled();
        expect(afuera).not.toHaveBeenCalled();
        // Con la lista ya cerrada, el Escape sí sigue de largo (cierra el modal).
        await user.keyboard('{Escape}');
        expect(afuera).toHaveBeenCalledTimes(1);
    });

    it('sin resultados muestra emptyText; con loading, "Buscando…"', async () => {
        const user = userEvent.setup();
        const { rerender } = render(<Combobox label="Cliente" options={CLIENTES} value={null} onChange={() => {}} emptyText="No hay clientes con ese nombre" />);
        await user.type(screen.getByRole('combobox', { name: 'Cliente' }), 'zzz');
        expect(screen.getByText('No hay clientes con ese nombre')).toBeInTheDocument();
        rerender(<Combobox label="Cliente" options={CLIENTES} value={null} onChange={() => {}} loading />);
        expect(screen.getByText('Buscando…')).toBeInTheDocument();
    });

    it('búsqueda remota: llama onSearch con el texto (debounce) y no filtra localmente', async () => {
        const user = userEvent.setup();
        const onSearch = vi.fn();
        render(<Combobox label="Cliente" options={CLIENTES} value={null} onChange={() => {}} onSearch={onSearch} />);
        await user.type(screen.getByRole('combobox', { name: 'Cliente' }), 'per');
        await waitFor(() => expect(onSearch).toHaveBeenLastCalledWith('per'));
        // Las opciones se muestran tal como vienen (el filtro lo hace el servidor).
        expect(screen.getAllByRole('option')).toHaveLength(3);
    });

    it('el error se conecta como descripción y marca aria-invalid', () => {
        render(<Combobox label="Cliente" options={CLIENTES} value={null} onChange={() => {}} error="El cliente es obligatorio" />);
        const cbx = screen.getByRole('combobox', { name: 'Cliente' });
        expect(cbx).toHaveAttribute('aria-invalid', 'true');
        expect(cbx).toHaveAccessibleDescription('El cliente es obligatorio');
    });

    it('con selectedLabel muestra el valor aunque su opción no esté en la lista', () => {
        render(<Combobox label="Cliente" options={[]} value={99} selectedLabel="Ana Ruiz" onChange={() => {}} />);
        expect(screen.getByRole('combobox', { name: 'Cliente' })).toHaveValue('Ana Ruiz');
    });
});
