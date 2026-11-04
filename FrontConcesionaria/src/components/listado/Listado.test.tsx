import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Listado, ListadoTabla, type ColumnaListado } from './index';

interface Fila { id: number; nombre: string }

const columnas: ColumnaListado<Fila>[] = [
    { clave: 'nombre', titulo: 'Nombre', tarjeta: 'titulo', celda: (f) => f.nombre },
    {
        clave: 'acciones',
        titulo: 'Acciones',
        tarjeta: 'acciones',
        celda: (f) => <button type="button" aria-label={`Editar ${f.nombre}`}>E</button>,
    },
];

const filas: Fila[] = [{ id: 1, nombre: 'Toyota Corolla' }, { id: 2, nombre: 'Ford Ka' }];
const vacio = { titulo: 'Todavía no cargaste vehículos', accion: <button type="button">Nuevo vehículo</button> };

describe('ListadoTabla', () => {
    it('muestra las filas con el rótulo de columna para la vista de tarjeta', () => {
        render(<ListadoTabla columnas={columnas} filas={filas} vacio={vacio} />);
        expect(screen.getByText('Toyota Corolla')).toBeInTheDocument();
        const celda = screen.getByText('Ford Ka').closest('td');
        expect(celda).toHaveAttribute('data-label', 'Nombre');
        expect(celda).toHaveClass('en-tarjeta-titulo');
    });

    it('mientras carga muestra filas fantasma y no el estado vacío', () => {
        render(<ListadoTabla columnas={columnas} filas={[]} cargando vacio={vacio} filasCargando={3} />);
        expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
        expect(document.querySelectorAll('tr.is-cargando')).toHaveLength(3);
        expect(screen.queryByText(vacio.titulo)).not.toBeInTheDocument();
    });

    it('un error del servidor no se confunde con "no hay datos" y ofrece reintentar', () => {
        const onReintentar = vi.fn();
        render(
            <ListadoTabla columnas={columnas} filas={[]} error mensajeError="No se pudieron cargar los vehículos" onReintentar={onReintentar} vacio={vacio} />,
        );
        expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar los vehículos');
        expect(screen.queryByText(vacio.titulo)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
        expect(onReintentar).toHaveBeenCalledTimes(1);
    });

    it('sin filtros, la lista vacía dice "todavía no hay" y muestra la acción para empezar', () => {
        render(<ListadoTabla columnas={columnas} filas={[]} vacio={vacio} />);
        expect(screen.getByText(vacio.titulo)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Nuevo vehículo' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
    });

    it('con filtros, la lista vacía ofrece limpiarlos', () => {
        const onLimpiar = vi.fn();
        render(<ListadoTabla columnas={columnas} filas={[]} vacio={vacio} hayFiltros onLimpiarFiltros={onLimpiar} />);
        expect(screen.getByText('Ningún resultado con estos filtros')).toBeInTheDocument();
        expect(screen.queryByText(vacio.titulo)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
        expect(onLimpiar).toHaveBeenCalledTimes(1);
    });

    it('la fila navegable se abre con clic y con Enter, pero no al tocar un botón propio', () => {
        const onFilaClick = vi.fn();
        render(
            <ListadoTabla
                columnas={columnas}
                filas={filas}
                vacio={vacio}
                onFilaClick={onFilaClick}
                etiquetaFila={(f) => `Abrir ${f.nombre}`}
            />,
        );
        const fila = screen.getByRole('row', { name: 'Abrir Toyota Corolla' });
        expect(fila).toHaveAttribute('tabindex', '0');

        fireEvent.click(fila);
        expect(onFilaClick).toHaveBeenLastCalledWith(filas[0]);

        fireEvent.keyDown(screen.getByRole('row', { name: 'Abrir Ford Ka' }), { key: 'Enter' });
        expect(onFilaClick).toHaveBeenLastCalledWith(filas[1]);
        expect(onFilaClick).toHaveBeenCalledTimes(2);

        fireEvent.click(screen.getByRole('button', { name: 'Editar Toyota Corolla' }));
        expect(onFilaClick).toHaveBeenCalledTimes(2);
    });

    it('pagina sólo cuando hay más de una página', () => {
        const onPaginaChange = vi.fn();
        const { rerender } = render(
            <ListadoTabla columnas={columnas} filas={filas} vacio={vacio} pagina={1} totalPaginas={1} onPaginaChange={onPaginaChange} />,
        );
        expect(screen.queryByRole('navigation', { name: 'Paginación' })).not.toBeInTheDocument();
        rerender(<ListadoTabla columnas={columnas} filas={filas} vacio={vacio} pagina={1} totalPaginas={3} onPaginaChange={onPaginaChange} />);
        fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
        expect(onPaginaChange).toHaveBeenCalledWith(2);
    });
});

describe('Listado', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('pone el título como encabezado y las acciones en el header', () => {
        render(
            <Listado titulo="Vehículos" subtitulo="Las unidades de tu concesionaria" accionPrincipal={<button type="button">Nuevo vehículo</button>}>
                <div />
            </Listado>,
        );
        expect(screen.getByRole('heading', { level: 1, name: 'Vehículos' })).toBeInTheDocument();
        expect(screen.getByText('Las unidades de tu concesionaria')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Nuevo vehículo' })).toBeInTheDocument();
    });

    it('los filtros se pliegan y despliegan, y recuerdan la preferencia', () => {
        const { unmount } = render(
            <Listado titulo="Vehículos" clave="test" filtros={<select aria-label="Estado"><option>Todos</option></select>} filtrosActivos={2}>
                <div />
            </Listado>,
        );
        const toggle = screen.getByRole('button', { name: /Filtros/ });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByLabelText('2 activos')).toBeInTheDocument();
        expect(screen.queryByRole('combobox', { name: 'Estado' })).not.toBeInTheDocument();

        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('combobox', { name: 'Estado' })).toBeVisible();
        unmount();

        // Al volver a la página, los filtros siguen abiertos.
        render(
            <Listado titulo="Vehículos" clave="test" filtros={<select aria-label="Estado"><option>Todos</option></select>}>
                <div />
            </Listado>,
        );
        expect(screen.getByRole('button', { name: /Filtros/ })).toHaveAttribute('aria-expanded', 'true');
    });

    it('"Limpiar filtros" aparece sólo con filtros activos', () => {
        const onLimpiar = vi.fn();
        const { rerender } = render(
            <Listado titulo="Vehículos" filtros={<span />} filtrosActivos={0} onLimpiarFiltros={onLimpiar}><div /></Listado>,
        );
        expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
        rerender(<Listado titulo="Vehículos" filtros={<span />} filtrosActivos={1} onLimpiarFiltros={onLimpiar}><div /></Listado>);
        fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
        expect(onLimpiar).toHaveBeenCalledTimes(1);
    });
});
