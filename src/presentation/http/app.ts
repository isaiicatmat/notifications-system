import { Type } from '@sinclair/typebox';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AuthService } from '../../application/auth-service';
import { createAuthenticationHook } from './auth-hooks';
import { registerAuthRoutes } from './auth-routes';
import { registerErrorHandler } from './error-handler';
import { ErrorResponse } from './schemas';
import type { NotificationService } from '../../application/notification-service';
import { registerNotificationRoutes } from './notification-routes';
import type { DeliveryHistoryService } from '../../application/delivery-history-service';
import { registerSwagger } from './swagger';

export interface AppDependencies {
    authService: AuthService;
    notificationService: NotificationService;
    deliveryHistoryService: DeliveryHistoryService;
    swaggerEnabled?: boolean;
    logger?: boolean;
}

//deps as arguments so tests can build the app with testing configuration
export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
    const app = Fastify({ logger: deps.logger ?? false });
    app.addSchema(ErrorResponse);
    app.decorateRequest('userId', '');
    registerErrorHandler(app);

    if (deps.swaggerEnabled ?? true) await registerSwagger(app);

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
        registerNotificationRoutes(
            protectedScope,
            deps.notificationService,
            deps.deliveryHistoryService,
        );
    });

    return app;
}
