import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
    /** Milisegundos que queda en pantalla (también anima la barra de progreso). */
    duracion: number;
}

/**
 * Cuánto dura cada aviso. Un error hay que poder LEERLO (y a veces copiarlo para
 * pasárselo a soporte): con 3 s desaparecía antes de terminar de leerlo. Los de
 * éxito sólo confirman lo que el usuario acaba de hacer, así que siguen cortos.
 */
export const DURACION_TOAST: Record<ToastType, number> = {
    success: 3000,
    info: 4000,
    warning: 6000,
    error: 7000,
};

interface UIState {
    toasts: Toast[];
    addToast: (message: string, type: ToastType, opciones?: { duracion?: number }) => void;
    removeToast: (id: number) => void;
}

// Contador propio: con Date.now() dos avisos en el mismo milisegundo compartían id
// (React los pisaba y el timer de uno borraba al otro).
let siguienteId = 1;

export const useUIStore = create<UIState>((set) => ({
    toasts: [],
    addToast: (message, type, opciones) => {
        const id = siguienteId++;
        const duracion = opciones?.duracion ?? DURACION_TOAST[type];
        set((state) => ({
            // El mismo aviso repetido (p.ej. dos queries que fallan por el mismo corte
            // de red) no se apila: reemplaza al anterior y reinicia su tiempo.
            toasts: [
                ...state.toasts.filter((t) => !(t.message === message && t.type === type)),
                { id, message, type, duracion },
            ],
        }));
        setTimeout(() => {
            set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
        }, duracion);
    },
    removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
