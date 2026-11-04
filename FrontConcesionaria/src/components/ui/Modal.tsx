import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    maxWidth?: string;
    footer?: React.ReactNode;
}

/** Lo que se puede enfocar con Tab dentro del diálogo (sin los centinelas). */
const ENFOCABLES = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]',
].map((sel) => `${sel}:not([data-centinela])`).join(',');

const enfocables = (raiz: Element | null | undefined): HTMLElement[] =>
    raiz ? Array.from(raiz.querySelectorAll<HTMLElement>(ENFOCABLES)) : [];

/** Enfoca el primero de la lista que de verdad acepte el foco (los ocultos no lo aceptan). */
const enfocarPrimero = (lista: HTMLElement[]): boolean => {
    for (const el of lista) {
        el.focus();
        if (document.activeElement === el) return true;
    }
    return false;
};

/**
 * Pila de modales abiertos. Con un modal encima de otro (p.ej. una confirmación
 * sobre un formulario), sólo el de arriba responde a Escape: antes los dos
 * escuchaban `window` y un Escape cerraba ambos.
 */
const pilaDeModales: object[] = [];

const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    subtitle,
    children,
    maxWidth = '600px',
    footer
}) => {
    // Monta al abrir; desmonta 300ms después de cerrar (para la animación de salida).
    const [render, setRender] = useState(isOpen);
    // El montaje es estado DERIVADO de isOpen: se ajusta durante el render (patrón
    // recomendado por React) en vez de dentro de un efecto. Así el modal aparece en
    // el mismo render —sin el frame extra que metía el efecto— y desaparece el
    // set-state-in-effect que marcaba el linter. El desmontaje SÍ es un efecto:
    // depende del tiempo, no del render.
    if (isOpen && !render) setRender(true);

    // Elemento que tenía el foco al abrir (el botón que abrió el modal), para
    // devolvérselo al cerrar. Se toma durante el render de la apertura, ANTES del
    // commit: si se tomara en un efecto, un `autoFocus` del contenido ya habría
    // movido el foco adentro del modal.
    const [abiertoAntes, setAbiertoAntes] = useState(false);
    const [disparador, setDisparador] = useState<HTMLElement | null>(null);
    if (isOpen !== abiertoAntes) {
        setAbiertoAntes(isOpen);
        if (isOpen && typeof document !== 'undefined') {
            setDisparador(document.activeElement instanceof HTMLElement ? document.activeElement : null);
        }
    }

    const boxRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; });

    const tituloId = useId();
    const subtituloId = useId();

    useEffect(() => {
        if (isOpen) return;
        const timer = setTimeout(() => setRender(false), 300);
        return () => clearTimeout(timer);
    }, [isOpen]);

    // Lock del scroll del body mientras el modal está abierto (puro side effect).
    useEffect(() => {
        if (!isOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [isOpen]);

    // Foco: al abrir entra al modal, Escape cierra (sólo el de arriba de la pila) y
    // al cerrar vuelve al disparador.
    useEffect(() => {
        if (!isOpen) return;
        const token = {};
        pilaDeModales.push(token);

        const box = boxRef.current;
        // Si el contenido ya enfocó algo (autoFocus), se respeta. Si no: el primer
        // campo del cuerpo, si no hay, el pie (en una confirmación queda en
        // "Cancelar", la opción segura), y si no, la X o el panel mismo.
        if (box && !box.contains(document.activeElement)) {
            const ok = enfocarPrimero(enfocables(box.querySelector('.modal-body')))
                || enfocarPrimero(enfocables(box.querySelector('.modal-footer')))
                || enfocarPrimero(enfocables(box));
            if (!ok) box.focus();
        }

        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || e.defaultPrevented) return;
            if (pilaDeModales[pilaDeModales.length - 1] !== token) return;
            e.preventDefault();
            onCloseRef.current();
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            const i = pilaDeModales.indexOf(token);
            if (i >= 0) pilaDeModales.splice(i, 1);
            if (disparador && disparador.isConnected) disparador.focus();
        };
    }, [isOpen, disparador]);

    // Retención del foco: dos centinelas enfocables en los bordes del panel. Si el
    // Tab sale por el final cae en el centinela de abajo, que lo manda al primer
    // control; Shift+Tab desde el primero cae en el de arriba, que lo manda al
    // último. Es más robusto que calcular "el último" en el keydown: no importa si
    // hay controles ocultos o deshabilitados en el medio.
    const alPrimero = () => {
        const lista = enfocables(boxRef.current);
        if (!enfocarPrimero(lista)) boxRef.current?.focus();
    };
    const alUltimo = () => {
        const lista = enfocables(boxRef.current).reverse();
        if (!enfocarPrimero(lista)) boxRef.current?.focus();
    };

    if (!render) return null;

    const modalContent = (
        <div
            className={`modal-overlay is-animated ${isOpen ? 'active' : ''}`}
            onClick={onClose}
            role="presentation"
        >
            <div
                ref={boxRef}
                className={`modal-box ${isOpen ? 'active' : ''}`}
                style={{ maxWidth }}
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby={tituloId}
                aria-describedby={subtitle ? subtituloId : undefined}
                tabIndex={-1}
            >
                <span tabIndex={isOpen ? 0 : -1} data-centinela="inicio" onFocus={alUltimo} />
                <header className="modal-header">
                    <div>
                        <h2 id={tituloId} className="text-xl font-black text-primary uppercase tracking-tight">{title}</h2>
                        {subtitle && (
                            <p id={subtituloId} className="modal-subtitle">{subtitle}</p>
                        )}
                    </div>
                    <button
                        className="icon-btn close-modal-btn"
                        onClick={onClose}
                        aria-label="Cerrar"
                        type="button"
                    >
                        <X size={20} aria-hidden="true" />
                    </button>
                </header>

                <div className="modal-body">
                    {children}
                </div>

                {footer && (
                    <footer className="modal-footer">
                        {footer}
                    </footer>
                )}
                <span tabIndex={isOpen ? 0 : -1} data-centinela="fin" onFocus={alPrimero} />
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

export default Modal;
