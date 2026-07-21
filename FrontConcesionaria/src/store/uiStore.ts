import { create } from 'zustand';

interface Toast {
    id: number;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
}

interface UIState {
    toasts: Toast[];
    addToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    removeToast: (id: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
    toasts: [],
    addToast: (message, type) => {
        const id = Date.now();
        set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
        setTimeout(() => {
            set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
        }, 3000);
    },
    removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
