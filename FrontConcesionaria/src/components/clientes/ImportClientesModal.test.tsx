import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import ImportClientesModal from './ImportClientesModal';

// El envío al backend se mockea: lo que se prueba acá es el PARSEO de la planilla con
// SheetJS (la distribución oficial 0.20.x de cdn.sheetjs.com, que reemplazó a la 0.18.5
// de npm por una vulnerabilidad sin arreglo allí) y el mapeo de columnas que sale de él.
const importar = vi.fn();
vi.mock('../../api/clientes.api', () => ({
    clientesApi: { importar: (...args: unknown[]) => importar(...args) },
}));

const vendedores = [{ id: 7, nombre: 'Juan Pérez' }];

const renderModal = () =>
    render(
        <QueryClientProvider client={new QueryClient()}>
            <ImportClientesModal isOpen onClose={() => { }} vendedores={vendedores} />
        </QueryClientProvider>,
    );

/** Un File con `arrayBuffer()` (jsdom no siempre lo implementa en File). */
const archivo = (contenido: ArrayBuffer | string, nombre: string, tipo: string): File => {
    const f = new File([contenido], nombre, { type: tipo });
    if (typeof f.arrayBuffer !== 'function') {
        const buf = typeof contenido === 'string' ? new TextEncoder().encode(contenido).buffer : contenido;
        Object.defineProperty(f, 'arrayBuffer', { value: () => Promise.resolve(buf) });
    }
    return f;
};

/** Planilla XLSX real generada con la misma librería (ida y vuelta por el formato binario). */
const planillaXlsx = (filas: unknown[][]): File => {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), 'Clientes');
    const bytes = XLSX.write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    return archivo(bytes, 'cartera.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
};

const subir = (f: File) => {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [f] } });
};

describe('ImportClientesModal (parseo con SheetJS)', () => {
    beforeEach(() => importar.mockReset());

    it('lee un .xlsx, salta filas vacías conservando el número de fila y auto-mapea las columnas', async () => {
        renderModal();
        subir(planillaXlsx([
            ['Nombre y apellido', 'Celular', 'Correo', 'DNI', 'Origen', 'Asesor'],
            ['Ana Gómez', 1155554444, 'ana@example.com', 30123456, 'Instagram', 'Juan Pérez'],
            [],
            ['Bruno Díaz', '11 4444-3333', '', '', 'wsp', ''],
        ]));

        expect(await screen.findByText('cartera.xlsx')).toBeInTheDocument();
        expect(screen.getByText('2 filas de datos detectadas · 6 columnas')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
        // Auto-detección por encabezado (sin acentos ni mayúsculas).
        expect((screen.getByLabelText('Nombre y apellido') as HTMLSelectElement).value).toBe('nombre');
        expect((screen.getByLabelText('Celular') as HTMLSelectElement).value).toBe('telefono');
        expect((screen.getByLabelText('Correo') as HTMLSelectElement).value).toBe('email');
        expect((screen.getByLabelText('DNI') as HTMLSelectElement).value).toBe('dni');
        expect((screen.getByLabelText('Origen') as HTMLSelectElement).value).toBe('canal');
        expect((screen.getByLabelText('Asesor') as HTMLSelectElement).value).toBe('vendedor');

        fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
        importar.mockResolvedValue({ creados: 2, actualizados: 0, salteados: 0, errores: [] });
        fireEvent.click(screen.getByRole('button', { name: /Importar 2 clientes/ }));

        await waitFor(() => expect(importar).toHaveBeenCalledTimes(1));
        const { filas } = importar.mock.calls[0][0] as { filas: Record<string, unknown>[] };
        expect(filas).toEqual([
            {
                nombre: 'Ana Gómez', telefono: '1155554444', email: 'ana@example.com', dni: '30123456',
                observaciones: undefined, origenLead: 'instagram', vendedorAsignadoId: 7,
            },
            {
                nombre: 'Bruno Díaz', telefono: '11 4444-3333', email: undefined, dni: undefined,
                observaciones: undefined, origenLead: 'whatsapp', vendedorAsignadoId: undefined,
            },
        ]);
        expect(await screen.findByText('Creados')).toBeInTheDocument();
    });

    it('lee un .csv por el mismo camino', async () => {
        renderModal();
        subir(archivo('nombre,telefono\nCarla Ruiz,3415550000\n', 'clientes.csv', 'text/csv'));
        expect(await screen.findByText('1 filas de datos detectadas · 2 columnas')).toBeInTheDocument();
    });

    it('muestra un error claro si la planilla no tiene filas de datos', async () => {
        renderModal();
        subir(planillaXlsx([['Nombre', 'Teléfono']]));
        expect(await screen.findByRole('alert')).toHaveTextContent('necesita una fila de encabezados y al menos una fila de datos');
        expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
    });
});
