export abstract class DomainError extends Error {
    abstract readonly code: string;
    constructor(message: string) {
        super(message);
        this.name = new.target.name;
    }
}

export class ValidationError extends DomainError {
        readonly code = 'VALIDATION_ERROR';
}

export class UnauthorizedError extends DomainError {
        readonly code = 'UNAUTHORIZED';
}

export class NotFoundError extends DomainError {
        readonly code = 'NOT_FOUND';
}

export class ConflictError extends DomainError {
        readonly code = 'CONFLICT';
}