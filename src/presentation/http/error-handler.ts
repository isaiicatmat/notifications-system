import { FastifyError, FastifyInstance } from "fastify";
import { 
    ConflictError, 
    DomainError, 
    NotFoundError, 
    UnauthorizedError, 
    ValidationError 
} from "../../domain/errors";

function statusFor(error: DomainError): number {
    if (error instanceof ValidationError) return 400;
    if (error instanceof UnauthorizedError) return 401;
    if (error instanceof NotFoundError) return 404;
    if (error instanceof ConflictError) return 409;
    return 500;
}

/** Maps domain errors, schema validation errors and unexpected errors to a consistent body */
export function registerErrorHandler(app: FastifyInstance): void {
    app.setErrorHandler((error: FastifyError | DomainError, request, reply) => {
        if (error instanceof DomainError) {
            return reply.status(statusFor(error)).send({ error: error.code, message: error.message});
        }

        const fastifyError = error as FastifyError;
        if(fastifyError.validation) {
            return reply.status(400).send({ error: 'VALIDATION_ERROR', message: fastifyError.message });
        }

        if (fastifyError.statusCode && fastifyError.statusCode < 500) {
            return reply
                .status(fastifyError.statusCode)
                .send({ error: fastifyError.code ?? 'BAD_REQUEST', message: fastifyError.message });
        }
        request.log.error(error);
        return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Internal server error '});
    });

    app.setNotFoundHandler((_request, reply) => {
        reply.status(404).send({ error: 'NOT_FOUND', message: 'Route not found '});
    });
}