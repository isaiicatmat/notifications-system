import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';

export async function registerSwagger(app: FastifyInstance): Promise<void> {
    await app.register(swagger, {
        openapi: {
            openapi: '3.0.3',
            info: {
                title: 'Notification System API',
                description: 'Authenticated users manage notifications delivered asynchronously through email, sms and push. ' +
                             'Log in, then use **Authorize** with the access token.',
                version: '1.0.0'
            },
            tags: [
                { name: 'Auth', description: 'Registration and login' },
                { name: 'Notifications', description: 'Manage my notifications and their deliveries' },
                { name: 'Health' }
            ],
            components: {
                securitySchemes: {
                    bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
                }
            }
        },
        refResolver: {
            buildLocalReference: (json, _baseUri, _fragment, i) => (json.$id as string) || `def-${i}`
        }
    });

    await app.register(swaggerUi, {routePrefix: '/docs' });
}