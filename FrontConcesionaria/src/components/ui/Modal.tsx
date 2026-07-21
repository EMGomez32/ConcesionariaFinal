import React, { useEffect, useState } from 'react';
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
    useEffect(() => {
        if (isOpen) {
            setRender(true);
            return;
        }
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

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    if (!render) return null;

    const modalContent = (
        <div
            className={`modal-overlay is-animated ${isOpen ? 'active' : ''}`}
            onClick={onClose}
            role="presentation"
        >
            <div
                className={`modal-box ${isOpen ? 'active' : ''}`}
                style={{ maxWidth }}
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={title}
            >
                <header className="modal-header">
                    <div>
                        <h2 className="text-xl font-black text-primary uppercase tracking-tight">{title}</h2>
                        {subtitle && (
                            <p className="modal-subtitle">{subtitle}</p>
                        )}
                    </div>
                    <button
                        className="icon-btn close-modal-btn"
                        onClick={onClose}
                        aria-label="Cerrar"
                        type="button"
                    >
                        <X size={20} />
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
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

export default Modal;
