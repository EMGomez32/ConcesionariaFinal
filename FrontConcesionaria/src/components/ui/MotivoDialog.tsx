import { useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Textarea from './Textarea';
import { getErrorMessage } from '../../utils/getErrorMessage';

/** Mismo mínimo que exige el backend (validation/motivo.ts). */
export const MOTIVO_MIN = 10;
export const MOTIVO_MAX = 500;

interface MotivoDialogProps {
    isOpen: boolean;
    title: string;
    /** Qué pasa si se confirma: se muestra arriba del campo. */
    message: string;
    confirmLabel: string;
    /** Rótulo del campo. Default: "Motivo". */
    label?: string;
    placeholder?: string;
    onCancel: () => void;
    /**
     * Recibe el motivo ya recortado. Si rechaza, el error del backend se muestra
     * DENTRO del diálogo y el diálogo queda abierto: lo típico es un 409 que dice
     * qué hay que revertir antes, y el usuario lo tiene que poder leer.
     */
    onConfirm: (motivo: string) => Promise<void>;
}

/**
 * Confirmación que pide un MOTIVO escrito: anular una venta, cancelar un plan.
 *
 * Existe aparte de ConfirmDialog porque estas operaciones deshacen plata y el
 * motivo es lo que el dueño lee después en la auditoría. El mínimo es el mismo
 * del backend para que el botón no habilite algo que el servidor va a rechazar.
 *
 * El componente se monta al abrir (el padre lo renderiza condicionalmente o lo
 * deja montado): el estado se limpia al cancelar o confirmar.
 */
const MotivoDialog = ({
    isOpen,
    title,
    message,
    confirmLabel,
    label = 'Motivo',
    placeholder = 'Contá por qué. Queda en la auditoría.',
    onCancel,
    onConfirm,
}: MotivoDialogProps) => {
    const [motivo, setMotivo] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [enviando, setEnviando] = useState(false);

    const recortado = motivo.trim();
    const faltan = MOTIVO_MIN - recortado.length;
    const valido = faltan <= 0 && recortado.length <= MOTIVO_MAX;

    const cerrar = () => {
        if (enviando) return;
        setMotivo('');
        setError(null);
        onCancel();
    };

    const confirmar = async () => {
        if (!valido || enviando) return;
        setEnviando(true);
        setError(null);
        try {
            await onConfirm(recortado);
            setMotivo('');
        } catch (e) {
            setError(getErrorMessage(e, 'No se pudo completar la operación'));
        } finally {
            setEnviando(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={cerrar}
            title={title}
            maxWidth="480px"
            footer={(
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', width: '100%' }}>
                    <Button variant="secondary" onClick={cerrar} disabled={enviando}>Volver</Button>
                    <Button variant="danger" onClick={confirmar} loading={enviando} disabled={!valido}>
                        {confirmLabel}
                    </Button>
                </div>
            )}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{message}</p>
                <Textarea
                    label={label}
                    rows={3}
                    maxLength={MOTIVO_MAX}
                    placeholder={placeholder}
                    value={motivo}
                    onChange={(e) => { setMotivo(e.target.value); if (error) setError(null); }}
                    hint={faltan > 0
                        ? `Escribí al menos ${MOTIVO_MIN} caracteres (te faltan ${faltan}).`
                        : 'Queda registrado junto con tu usuario.'}
                    autoFocus
                />
                {error && (
                    <p role="alert" style={{ margin: 0, color: 'var(--danger)', fontSize: 'var(--text-sm)', lineHeight: 1.5 }}>
                        {error}
                    </p>
                )}
            </div>
        </Modal>
    );
};

export default MotivoDialog;
