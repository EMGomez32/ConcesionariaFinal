/** Helper to extract data from API responses.
 *  The Axios interceptor returns `response.data`, so what we receive
 *  is `{ success: boolean, data: T, message?: string }`.
 *  This helper safely extracts `data` from that shape. */
export function extractApiData<T>(res: unknown): T {
    const r = res as { data?: T; results?: T };
    return (r?.data ?? r?.results ?? res) as T;
}

/** Extract paginated data from API response */
export function extractPaginatedData<T>(res: unknown): {
    results: T[];
    totalPages: number;
    totalResults: number;
    page: number;
    limit: number;
} {
    const r = res as {
        data?: {
            results?: T[];
            totalPages?: number;
            totalResults?: number;
            page?: number;
            limit?: number;
        };
        results?: T[];
        totalPages?: number;
        totalResults?: number;
        page?: number;
        limit?: number;
    };
    const d = r?.data ?? r;
    return {
        results: d?.results ?? [],
        totalPages: d?.totalPages ?? 1,
        totalResults: d?.totalResults ?? 0,
        page: d?.page ?? 1,
        limit: d?.limit ?? 20,
    };
}

/** Extract a flat array from API response (for dropdown catalogs) */
export function extractArrayData<T>(res: unknown): T[] {
    const r = res as { data?: { results?: T[] } | T[] };
    if (Array.isArray(r?.data)) return r.data;
    if (r?.data && 'results' in r.data) return r.data.results ?? [];
    return [];
}
