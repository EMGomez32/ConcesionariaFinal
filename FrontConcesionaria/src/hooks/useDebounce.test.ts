import { renderHook, act } from '@testing-library/react';
import { useDebounce } from './useDebounce';
import { vi, describe, it, expect } from 'vitest';

describe('useDebounce Hook', () => {
    it('returns initial value immediately', () => {
        const { result } = renderHook(() => useDebounce('test', 500));
        expect(result.current).toBe('test');
    });

    it('debounces the value change', () => {
        vi.useFakeTimers();

        const { result, rerender } = renderHook(
            ({ value, delay }) => useDebounce(value, delay),
            { initialProps: { value: 'initial', delay: 500 } }
        );

        expect(result.current).toBe('initial');

        // Update value
        rerender({ value: 'updated', delay: 500 });

        // Value shouldn't change immediately
        expect(result.current).toBe('initial');

        // Fast forward time
        act(() => {
            vi.advanceTimersByTime(500);
        });

        // Now value should be updated
        expect(result.current).toBe('updated');

        vi.useRealTimers();
    });
});
