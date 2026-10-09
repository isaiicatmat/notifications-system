import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthService } from "../../application/auth-service";
import { UnauthorizedError } from "../../domain/errors";

//Extends FastifyRequest type so request.userId is types in all routes
declare module 'fastify' {
    interface FastifyRequest {
        userId: string;
    }
}

function extractBearerToken(header: string | undefined): string | null {
    if (!header) return null;
    const [scheme, token, ...rest] = header.trim().split(/\s+/);
    const isBearer = scheme?.toLocaleLowerCase() === 'bearer';
    if (!isBearer || !token || rest.length > 0) return null;
    return token;
}

export function createAuthenticationHook(auth: AuthService) {
    return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
        const token = extractBearerToken(request.headers.authorization);
        if (!token) throw new UnauthorizedError('Missing bearer token');
        const { userId } = await auth.authenticate(token);
        request.userId = userId;
    }
}