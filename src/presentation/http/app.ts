import { Type } from "@sinclair/typebox";
import Fastify, { type FastifyInstance } from "fastify";
import type { AuthService } from "../../application/auth-service";
import { createAuthenticationHook } from "./auth-hooks";
import { registerAuthRoutes } from "./auth-routes";
import { registerErrorHandler } from "./error-handler";
import { ErrorResponse } from "./schemas";

export interface AppDependencies {
    authService: AuthService,
    logger?: boolean
}

//deps as arguments so tests can build the app with testing configuration
export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
    const app = Fastify({ logger: deps.logger ?? false });
    app.addSchema(ErrorResponse);
    app.decorateRequest('userId', '');
    registerErrorHandler(app);

    //public routes
    app.get(
        '/health',
        {
            schema: {
                tags: ['Health'],
                summary: 'Liveness check',
                response: { 200: Type.Object({ status: Type.Literal('ok') }) },
            },
        },
        async () => ({ status: 'ok' as const }),
    );
    registerAuthRoutes(app, deps.authService);

    //Protected routes: everything inside here needs a valid token
    await app.register(async (protectedScope) => {
        protectedScope.addHook('onRequest', createAuthenticationHook(deps.authService));
        //Temporary route to test hook, will be replaced later
        protectedScope.get('/me', async (request) => ({ id: request.userId }));
    });

    return app;
}