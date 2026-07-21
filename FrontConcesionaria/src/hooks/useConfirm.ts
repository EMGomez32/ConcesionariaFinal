import { useConfirmStore } from '../store/confirmStore';

export const useConfirm = () => {
    const { showConfirm, hideConfirm, setLoading } = useConfirmStore();

    const confirm = (options: {
        title: string;
        message: string;
        confirmLabel?: string;
        cancelLabel?: string;
        type?: 'default' | 'danger' | 'warning' | 'info' | 'success' | 'question';
        onConfirm: () => Promise<void> | void;
    }) => {
        return new Promise<void>((resolve) => {
            showConfirm({
                ...options,
                onConfirm: async () => {
                    try {
                        setLoading(true);
                        await options.onConfirm();
                        setLoading(false);
                        hideConfirm();
                        resolve();
                    } catch {
                        setLoading(false);
                    }
                },
                onCancel: () => {
                    hideConfirm();
                }
            });
        });
    };

    return confirm;
};
