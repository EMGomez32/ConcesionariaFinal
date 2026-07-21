import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({ currentPage, totalPages, onPageChange }) => {
    if (totalPages <= 1) return null;

    return (
        <nav className="pager" aria-label="Paginación">
            <button
                type="button"
                className="pager-btn"
                disabled={currentPage <= 1}
                onClick={() => onPageChange(currentPage - 1)}
                aria-label="Página anterior"
            >
                <ChevronLeft size={16} />
                <span>Anterior</span>
            </button>

            <div className="pager-status">
                <span className="pager-current">{currentPage}</span>
                <span className="pager-divider">/</span>
                <span className="pager-total">{totalPages}</span>
            </div>

            <button
                type="button"
                className="pager-btn"
                disabled={currentPage >= totalPages}
                onClick={() => onPageChange(currentPage + 1)}
                aria-label="Página siguiente"
            >
                <span>Siguiente</span>
                <ChevronRight size={16} />
            </button>

            <style>{`
                .pager {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: var(--space-4);
                    padding-top: var(--space-6);
                }

                .pager-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.4rem;
                    padding: 0.5rem 0.9rem;
                    border-radius: var(--radius-pill);
                    background: var(--bg-card);
                    color: var(--text-secondary);
                    border: 1px solid var(--border);
                    font-family: var(--font-sans);
                    font-size: var(--text-sm);
                    font-weight: 600;
                    cursor: pointer;
                    transition: border-color var(--duration-base) var(--easing-soft),
                                background var(--duration-base) var(--easing-soft),
                                color var(--duration-base) var(--easing-soft),
                                transform var(--duration-base) var(--easing-soft);
                }

                .pager-btn:hover:not(:disabled) {
                    border-color: var(--accent);
                    color: var(--accent);
                    background: var(--accent-light);
                    transform: translateY(-1px);
                }

                .pager-btn:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }

                .pager-status {
                    display: inline-flex;
                    align-items: baseline;
                    gap: 0.4rem;
                    padding: 0.4rem 0.9rem;
                    border-radius: var(--radius-pill);
                    background: var(--bg-secondary);
                    border: 1px solid var(--border);
                    font-family: var(--font-display);
                    font-variant-numeric: tabular-nums;
                }

                .pager-current {
                    font-size: var(--text-md);
                    font-weight: 700;
                    color: var(--text-primary);
                }

                .pager-divider {
                    color: var(--text-muted);
                    font-weight: 500;
                }

                .pager-total {
                    color: var(--text-muted);
                    font-weight: 600;
                    font-size: var(--text-sm);
                }
            `}</style>
        </nav>
    );
};

export default Pagination;
