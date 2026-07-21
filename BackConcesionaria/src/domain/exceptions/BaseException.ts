export class BaseException extends Error {
    constructor(
        public readonly statusCode: number,
        public readonly message: string,
        public readonly errorCode: string,
        public readonly isOperational: boolean = true
    ) {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
        Error.captureStackTrace(this, this.constructor);
    }
}

export class UnauthorizedException extends BaseException {
    constructor(message = 'No autorizado') {
        super(401, message, 'UNAUTHORIZED');
    }
}

export class ForbiddenException extends BaseException {
    constructor(message = 'Permisos insuficientes') {
        super(403, message, 'FORBIDDEN');
    }
}

export class NotFoundException extends BaseException {
    constructor(resource: string) {
        super(404, `${resource} no encontrado`, 'NOT_FOUND');
    }
}

export class ValidationException extends BaseException {
    constructor(errors: any) {
        super(400, 'Error de validación', 'VALIDATION_ERROR');
        (this as any).details = errors;
    }
}
