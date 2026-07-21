class ApiError extends Error {
    public statusCode: number;
    public isOperational: boolean;
    public code: string;

    constructor(statusCode: number, message: string, code: string | null = null, isOperational = true, stack = '') {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.code = code || this._getDefaultCode(statusCode);
        if (stack) {
            this.stack = stack;
        } else {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    private _getDefaultCode(statusCode: number): string {
        switch (statusCode) {
            case 400: return 'VALIDATION_ERROR';
            case 401: return 'UNAUTHORIZED';
            case 403: return 'FORBIDDEN';
            case 404: return 'NOT_FOUND';
            case 409: return 'CONFLICT';
            default: return 'INTERNAL_ERROR';
        }
    }
}

export default ApiError;
