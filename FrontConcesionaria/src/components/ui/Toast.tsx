import { useUIStore } from '../../store/uiStore';
import { CheckCircle, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';

const Toast = () => {
  const { toasts, removeToast } = useUIStore();

  return (
    <div className="toast-container" role="region" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type}`}
          role={toast.type === 'error' ? 'alert' : 'status'}
        >
          <div className="toast-icon" aria-hidden="true">
            {toast.type === 'success' && <CheckCircle size={18} />}
            {toast.type === 'error' && <AlertCircle size={18} />}
            {toast.type === 'info' && <Info size={18} />}
            {toast.type === 'warning' && <AlertTriangle size={18} />}
          </div>
          <p className="toast-message">{toast.message}</p>
          <button
            className="toast-close"
            onClick={() => removeToast(toast.id)}
            aria-label="Cerrar notificación"
            type="button"
          >
            <X size={14} />
          </button>
          <div className="toast-progress" aria-hidden="true"></div>
        </div>
      ))}

      <style>{`
        .toast-container {
          position: fixed;
          top: var(--space-6);
          right: var(--space-6);
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          z-index: 9999;
          pointer-events: none;
        }

        .toast {
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: 0.85rem 1.1rem;
          padding-right: 2.5rem;
          border-radius: var(--radius-lg);
          min-width: 300px;
          max-width: 420px;
          background: color-mix(in srgb, var(--bg-card) 90%, transparent);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          border: 1px solid var(--border);
          color: var(--text-primary);
          font-family: var(--font-sans);
          pointer-events: auto;
          animation: toast-slide-in 0.32s var(--easing-spring) both;
        }

        .toast::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: currentColor;
        }

        .toast-success { color: var(--success); box-shadow: 0 18px 32px -16px rgba(var(--accent-rgb), 0.35); }
        .toast-error   { color: var(--danger);  box-shadow: 0 18px 32px -16px rgba(239, 68, 68, 0.35); }
        .toast-info    { color: var(--info);    box-shadow: 0 18px 32px -16px rgba(var(--accent-3-rgb), 0.35); }
        .toast-warning { color: var(--warning); box-shadow: 0 18px 32px -16px rgba(245, 158, 11, 0.35); }

        .toast-icon {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: var(--radius-sm);
          background: color-mix(in srgb, currentColor 12%, transparent);
        }

        .toast-message {
          font-size: var(--text-sm);
          font-weight: 500;
          color: var(--text-primary);
          flex: 1;
          line-height: 1.4;
        }

        .toast-close {
          position: absolute;
          top: 0.5rem;
          right: 0.5rem;
          color: var(--text-muted);
          background: transparent;
          border: none;
          padding: 0.35rem;
          border-radius: var(--radius-sm);
          cursor: pointer;
          z-index: 2;
          transition: background var(--duration-base) var(--easing-soft),
                      color var(--duration-base) var(--easing-soft);
        }

        .toast-close:hover {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }

        .toast-progress {
          position: absolute;
          bottom: 0;
          left: 0;
          height: 2px;
          background: currentColor;
          opacity: 0.65;
          animation: toast-progress 3s linear forwards;
        }

        @keyframes toast-progress {
          from { width: 100%; }
          to { width: 0%; }
        }

        @keyframes toast-slide-in {
          from { transform: translateX(120%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default Toast;
