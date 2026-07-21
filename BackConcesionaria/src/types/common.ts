export interface QueryOptions {
    limit?: string | number;
    page?: string | number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
    results: T[];
    page: number;
    limit: number;
    totalPages: number;
    totalResults: number;
}
