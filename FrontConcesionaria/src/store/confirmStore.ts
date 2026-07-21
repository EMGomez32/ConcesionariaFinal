import { create } from 'zustand';

interface ConfirmOptions {
    title: string;
    message: string;
    type?: 'default' | 'danger' | 'warning' | 'info' | 'success' | 'question';
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm?: () => void | Promise<void>;
    onCancel?: () => void;
}

interface ConfirmState extends ConfirmOptions {
    isOpen: boolean;
    loading: boolean;
    showConfirm: (options: ConfirmOptions) => void;
    hideConfirm: () => void;
    setLoading: (loading: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set) => ({
    isOpen: false,
    title: '',
    message: '',
    type: 'default',
    confirmLabel: 'Confirmar',
    cancelLabel: 'Cancelar',
    loading: false,
    showConfirm: (options) => set({
        isOpen: true,
        ...options,
        type: options.type || 'default',
        confirmLabel: options.confirmLabel || 'Confirmar',
        cancelLabel: options.cancelLabel || 'Cancelar'
    }),
    hideConfirm: () => set({ isOpen: false, loading: false }),
    setLoading: (loading) => set({ loading }),
}));
