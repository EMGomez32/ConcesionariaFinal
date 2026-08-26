/**
 * Detalle estructurado que acompaña al error en la respuesta HTTP.
 *
 * Vive tipado en la clase base —y no como `(this as any).details` repetido en
 * cada subclase— porque el `errorHandler` lo adjunta SIEMPRE que está presente:
 * si el campo no existe en el tipo, el contrato de los 409 del mostrador
 * (`faltantes`, `requeridos`, el aviso de asignación) queda fuera del alcance
 * del compilador y cualquier renombre lo rompe en silencio.
 */
export type DetalleDeError = Record<string, unknown> | unknown[];

export class BaseException extends Error {
    /** Ver `DetalleDeError`. Opcional: la mayoría de los errores no lo usa. */
    public details?: DetalleDeError;

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
    constructor(errors: DetalleDeError, message = 'Error de validación') {
        super(400, message, 'VALIDATION_ERROR');
        this.details = errors;
    }
}
