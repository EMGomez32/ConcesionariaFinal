export interface PaginationMeta {
    totalResults: number;
    totalPages: number;
    page: number;
    limit: number;
}

export interface PaginatedResponse<T> {
    results: T[];
    totalResults: number;
    totalPages: number;
    page: number;
    limit: number;
}

export interface ApiResponse<T> {
    success: boolean;
    data: T;
    message?: string;
    errors?: unknown;
}

export interface ApiError {
    success: boolean;
    message: string;
    errors?: unknown;
}
