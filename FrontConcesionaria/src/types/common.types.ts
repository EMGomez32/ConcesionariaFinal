export interface PaginationOptions {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export type QueryParams<T = Record<string, unknown>> = T & PaginationOptions;
