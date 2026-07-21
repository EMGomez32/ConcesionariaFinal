import Modal from './Modal';
import Button from './Button';
import { AlertTriangle, HelpCircle, Info, Trash2, CheckCircle2 } from 'lucide-react';

export type ConfirmType = 'default' | 'danger' | 'warning' | 'info' | 'success' | 'question';

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    type?: ConfirmType;
    onConfirm: () => void;
    onCancel: () => void;
    loading?: boolean;
}

const TYPE_META: Record<ConfirmType, { color: string; bg: string; Icon: React.ElementType }> = {
    default: { color: 'var(--text-secondary)', bg: 'var(--bg-secondary)', Icon: Info },
    danger: { color: 'var(--danger)', bg: 'rgba(239, 68, 68, 0.10)', Icon: Trash2 },
    warning: { color: 'var(--warning)', bg: 'rgba(245, 158, 11, 0.10)', Icon: AlertTriangle },
    info: { color: 'var(--info)', bg: 'rgba(var(--accent-3-rgb), 0.10)', Icon: Info },
    success: { color: 'var(--success)', bg: 'rgba(var(--accent-rgb), 0.10)', Icon: CheckCircle2 },
    question: { color: 'var(--accent-2)', bg: 'rgba(var(--accent-2-rgb), 0.10)', Icon: HelpCircle },
};

const ConfirmDialog = ({
    isOpen,
    title,
    message,
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    type = 'question',
    onConfirm,
    onCancel,
    loading = false
}: ConfirmDialogProps) => {
    const meta = TYPE_META[type];
    const Icon = meta.Icon;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onCancel}
            title={title}
            maxWidth="420px"
            footer={(
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', width: '100%' }}>
                    <Button variant="secondary" onClick={onCancel} disabled={loading}>
                        {cancelLabel}
                    </Button>
                    <Button
                        variant={type === 'danger' ? 'danger' : 'primary'}
                        onClick={onConfirm}
                        loading={loading}
                    >
                        {confirmLabel}
                    </Button>
                </div>
            )}
        >
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: 'var(--space-5)',
                padding: 'var(--space-2) 0'
            }}>
                <div
                    style={{
                        width: 72,
                        height: 72,
                        borderRadius: 'var(--radius-xl)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: meta.bg,
                        color: meta.color,
                        border: `1px solid ${meta.color}33`,
                    }}
                >
                    <Icon size={32} />
                </div>
                <p style={{
                    color: 'var(--text-secondary)',
                    fontSize: 'var(--text-md)',
                    fontWeight: 500,
                    lineHeight: 1.55,
                    maxWidth: 320,
                    margin: 0,
                }}>
                    {message}
                </p>
            </div>
        </Modal>
    );
};

export default ConfirmDialog;
