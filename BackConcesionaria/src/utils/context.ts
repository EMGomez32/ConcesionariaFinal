import { AsyncLocalStorage } from 'async_hooks';

export interface UserContext {
    userId: number;
    tenantId: number;
    roles: string[];
}

export const contextStorage = new AsyncLocalStorage<UserContext>();

export const getContext = () => contextStorage.getStore();
