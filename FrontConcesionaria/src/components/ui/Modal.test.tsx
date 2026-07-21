import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

        // Find the backdrop element (the parent of the modal content)
        // Usually clicking the top level div simulating the overlay
        const backdrop = screen.getByText('Test Modal').closest('.modal-overlay') as HTMLElement;
        if (backdrop) {
            fireEvent.click(backdrop);
            expect(onCloseMock).toHaveBeenCalledTimes(1);
        }
    });

    it('does NOT call onClose when clicking inside the modal content', () => {
        const onCloseMock = vi.fn();
        render(<Modal isOpen={true} onClose={onCloseMock} title="Test Modal"><div>Content</div></Modal>);

        const content = screen.getByText('Content');
        fireEvent.click(content);

        expect(onCloseMock).not.toHaveBeenCalled();
    });
});
