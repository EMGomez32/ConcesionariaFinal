import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from './Modal';

describe('Modal component', () => {
    it('does not render when isOpen is false', () => {
        render(<Modal isOpen={false} onClose={() => { }} title="Test Modal"><div>Content</div></Modal>);
        expect(screen.queryByText('Test Modal')).not.toBeInTheDocument();
        expect(screen.queryByText('Content')).not.toBeInTheDocument();
    });

    it('renders correctly when isOpen is true', () => {
        render(<Modal isOpen={true} onClose={() => { }} title="Test Modal"><div>Content</div></Modal>);
        expect(screen.getByText('Test Modal')).toBeInTheDocument();
        expect(screen.getByText('Content')).toBeInTheDocument();
    });

    it('calls onClose when close button is clicked', () => {
        const onCloseMock = vi.fn();
        render(<Modal isOpen={true} onClose={onCloseMock} title="Test Modal"><div>Content</div></Modal>);

        const closeButton = screen.getByRole('button');
        fireEvent.click(closeButton);

        expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when clicking outside the modal content', () => {
        const onCloseMock = vi.fn();
        render(<Modal isOpen={true} onClose={onCloseMock} title="Test Modal"><div>Content</div></Modal>);

        const backdrop = screen.getByText('Test Modal').closest('.modal-overlay') as HTMLElement;
        fireEvent.click(backdrop);
        expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it('does NOT call onClose when clicking inside the modal content', () => {
        const onCloseMock = vi.fn();
        render(<Modal isOpen={true} onClose={onCloseMock} title="Test Modal"><div>Content</div></Modal>);

        fireEvent.click(screen.getByText('Content'));
        expect(onCloseMock).not.toHaveBeenCalled();
    });

    it('el diálogo se nombra con su título (aria-labelledby)', () => {
        render(<Modal isOpen onClose={() => { }} title="Nuevo cliente" subtitle="Cargá los datos"><div>x</div></Modal>);
        const dialogo = screen.getByRole('dialog', { name: 'Nuevo cliente' });
        expect(dialogo).toHaveAccessibleDescription('Cargá los datos');
    });

    it('al abrir enfoca el primer campo del cuerpo', () => {
        render(
            <Modal isOpen onClose={() => { }} title="Form" footer={<button>Guardar</button>}>
                <input aria-label="Nombre" />
                <input aria-label="Apellido" />
            </Modal>,
        );
        expect(screen.getByLabelText('Nombre')).toHaveFocus();
    });

    it('retiene el foco: Tab desde el último vuelve al primero y Shift+Tab al revés', async () => {
        const user = userEvent.setup();
        render(
            <Modal isOpen onClose={() => { }} title="Form" footer={<button>Guardar</button>}>
                <input aria-label="Nombre" />
            </Modal>,
        );
        const cerrar = screen.getByRole('button', { name: 'Cerrar' });
        const nombre = screen.getByLabelText('Nombre');
        const guardar = screen.getByRole('button', { name: 'Guardar' });
        expect(nombre).toHaveFocus();
        await user.tab();
        expect(guardar).toHaveFocus();
        await user.tab();
        expect(cerrar).toHaveFocus(); // dio la vuelta: el primero del panel es la X
        await user.tab({ shift: true });
        expect(guardar).toHaveFocus();
    });

    it('Escape cierra sólo el modal de arriba', () => {
        const abajo = vi.fn();
        const arriba = vi.fn();
        render(
            <>
                <Modal isOpen onClose={abajo} title="Abajo"><input aria-label="a" /></Modal>
                <Modal isOpen onClose={arriba} title="Arriba"><input aria-label="b" /></Modal>
            </>,
        );
        fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
        expect(arriba).toHaveBeenCalledTimes(1);
        expect(abajo).not.toHaveBeenCalled();
    });

    it('al cerrar devuelve el foco al botón que lo abrió', async () => {
        const user = userEvent.setup();
        const Prueba = () => {
            const [abierto, setAbierto] = useState(false);
            return (
                <>
                    <button onClick={() => setAbierto(true)}>Abrir</button>
                    <Modal isOpen={abierto} onClose={() => setAbierto(false)} title="Detalle">
                        <input aria-label="Campo" />
                    </Modal>
                </>
            );
        };
        render(<Prueba />);
        const abrir = screen.getByRole('button', { name: 'Abrir' });
        await user.click(abrir);
        expect(screen.getByLabelText('Campo')).toHaveFocus();
        await user.keyboard('{Escape}');
        expect(abrir).toHaveFocus();
    });
});
