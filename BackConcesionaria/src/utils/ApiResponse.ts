export interface ErrorResponse {
    code: string;
    message: string;
    statusCode: number;
}

export interface StandardResponse<T> {
    success: boolean;
    data?: T;
    meta?: any;
    error?: ErrorResponse;
}

class ApiResponse {
    static success<T>(data: T, meta: any = null): StandardResponse<T> {
        return {
            success: true,
            data,
            ...(meta && { meta }),
        };
    }

    static error(message: string, statusCode = 500, code = 'INTERNAL_ERROR'): StandardResponse<never> {
        return {
            success: false,
            error: {
                code,
                message,
                statusCode,
            },
        };
    }
}

export default ApiResponse;
