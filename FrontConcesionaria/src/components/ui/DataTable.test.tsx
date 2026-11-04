import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import DataTable, { type Column } from './DataTable';

type Fila = { id: number; nombre: string };
const COLS: Column<Fila>[] = [
    { header: 'Nombre', accessor: 'nombre' },
    { header: 'Acciones', accessor: (f) => <button onClick={(e) => { e.stopPropagation(); }}>Editar {f.nombre}</button> },
];
const FILAS: Fila[] = [{ id: 1, nombre: 'Ana' }, { id: 2, nombre: 'Beto' }];

describe('DataTable', () => {
    it('las filas clicables se recorren con Tab y se abren con Enter o Espacio', async () => {
        const user = userEvent.setup();
        const onRowClick = vi.fn();
        render(<DataTable columns={COLS} data={FILAS} onRowClick={onRowClick} rowLabel={(f) => `Abrir ${f.nombre}`} />);
        const fila = screen.getByRole('row', { name: 'Abrir Ana' });
        expect(fila).toHaveAttribute('tabindex', '0');
        expect(fila).toHaveClass('dt-row-clickable');
        fila.focus();
        await user.keyboard('{Enter}');
        expect(onRowClick).toHaveBeenLastCalledWith(FILAS[0]);
        await user.keyboard(' ');
        expect(onRowClick).toHaveBeenCalledTimes(2);
    });

    it('Enter sobre un botón de la fila es del botón, no abre la fila', async () => {
        const user = userEvent.setup();
        const onRowClick = vi.fn();
        render(<DataTable columns={COLS} data={FILAS} onRowClick={onRowClick} />);
        screen.getByRole('button', { name: 'Editar Ana' }).focus();
        await user.keyboard('{Enter}');
        expect(onRowClick).not.toHaveBeenCalled();
    });

    it('sin onRowClick las filas no entran al orden de tabulación', () => {
        render(<DataTable columns={COLS} data={FILAS} />);
        const filas = screen.getAllByRole('row').slice(1);
        filas.forEach((f) => expect(f).not.toHaveAttribute('tabindex'));
    });

    it('con `error` muestra el estado de error (no el vacío) y Reintentar', async () => {
        const user = userEvent.setup();
        const onRetry = vi.fn();
        render(<DataTable columns={COLS} data={[]} error={{ message: 'Network Error' }} onRetry={onRetry} emptyMessage="No hay ventas" />);
        expect(screen.queryByText('No hay ventas')).not.toBeInTheDocument();
        expect(screen.getByText('No hay conexión con el servidor. Revisá tu internet y probá de nuevo.')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Reintentar' }));
        expect(onRetry).toHaveBeenCalled();
    });

    it('vacío: "Limpiar filtros" y la acción opcional', async () => {
        const user = userEvent.setup();
        const limpiar = vi.fn();
        render(
            <DataTable
                columns={COLS}
                data={[]}
                emptyMessage="No hay clientes"
                emptyHint="Probá con otro nombre"
                onClearFilters={limpiar}
                emptyAction={<button>Cargar cliente</button>}
            />,
        );
        expect(screen.getByText('Probá con otro nombre')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cargar cliente' })).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
        expect(limpiar).toHaveBeenCalled();
    });
});
