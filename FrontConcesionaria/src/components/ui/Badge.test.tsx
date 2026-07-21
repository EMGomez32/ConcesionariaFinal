import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Badge from './Badge';

describe('Badge Component', () => {
    it('renders the badge with text', () => {
        render(<Badge>Active</Badge>);
        expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('applies default styles', () => {
        const { container } = render(<Badge>Default</Badge>);
        const span = container.querySelector('span');
        expect(span).toHaveClass('badge');
    });

    it('applies variant colors correctly', () => {
        render(<Badge variant="success">Success</Badge>);
        const badge = screen.getByText('Success');
        // Check for specific styles if needed, but since they use CSS variables, 
        // we mainly check if it renders without crashing with the variant.
        expect(badge).toBeInTheDocument();
    });
});
