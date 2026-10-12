import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { NotificationService } from "../../application/notification-service";
import { NOTIFICATION_STATUSES, type Notification } from "../../domain/notification";
import { errorResponses } from "./schemas";

const Title = Type.String({ minLength: 1, maxLength: 200, examples: ["Welcome!"] });
const Content = Type.String({ minLength: 1, maxLength: 5000, examples: ['Thanks for signing up.'] });
const Channel = Type.String({ minLength: 1, maxLength: 50, examples: ['email'] });
const Recipient = Type.String({
    minLength: 1,
    maxLength: 320,
    description: 'Email addres, phone number (E. 164) or device token, depending on the channel',
    examples: ['user@example.com']
});

const CreateNotificationBody = Type.Object(
    { title: Title, content: Content, channel: Channel, recipient: Recipient },
    { additionalProperties: false}
);
const UpdateNotificationBody = Type.Partial(CreateNotificationBody, { minProperties: 1 });
const IdParams = Type.Object({ id: Type.String({ format: 'uuid' })});

const NotificationResponse = Type.Object({
    id: Type.String({ format: 'uuid' }),
    title: Type.String(),
    content: Type.String(),
    channel: Type.String(),
    recipient: Type.String(),
    status: Type.Union(NOTIFICATION_STATUSES.map((status) => Type.Literal(status))),
    attempts: Type.Integer(),
    createdAt: Type.String({ format: 'date-time' }),
    updatedAt: Type.String({ format: 'date-time' }),
});

/** Maps a domain entity to the public response DTO */
export function toNotificationDto(notification: Notification): Static<typeof NotificationResponse> {
    return {
        id: notification.id,
        title: notification.title,
        content: notification.content,
        channel: notification.channel,
        recipient: notification.recipient,
        status: notification.status,
        attempts: notification.attempts,
        createdAt: notification.createdAt.toISOString(),
        updatedAt: notification.createdAt.toISOString()
    };
}

const security = [{ bearerAuth: [] }];

export function registerNotificationRoutes(
    app: FastifyInstance,
    notifications: NotificationService
): void {
    app.post<{ Body: Static<typeof CreateNotificationBody> }>(
        '/notifications',
        {
            schema: {
                tags: ['Notifications'],
                summary: 'Create a notification and schedule its delivery',
                security,
                body: CreateNotificationBody,
                response: {
                    201: NotificationResponse,
                    400: errorResponses[400],
                    401: errorResponses[401],
                },
            },
        },
        async (request, reply) => {
            const created = await notifications.create(request.userId, request.body);
            return reply.status(201).send(toNotificationDto(created));
        }
    );

    app.get(
        '/notifications',
        {
            schema: {
                tags: ['Notifications'],
                summary: 'List my notifications (newest first)',
                security,
                response: { 200: Type.Array(NotificationResponse), 401: errorResponses[401] }
            },
        },
        async (request) => ((await notifications.list(request.userId)).map(toNotificationDto))
    );

    app.patch<{ Params: Static<typeof IdParams>; Body: Static<typeof UpdateNotificationBody> }>(
        '/notifications/:id',
        {
            schema: {
                tags: ['Notifications'],
                summary: 'Modify a notification that is still pending or failed',
                security,
                params: IdParams,
                body: UpdateNotificationBody,
                response: {
                    200: NotificationResponse,
                    400: errorResponses[400],
                    401: errorResponses[401],
                    404: errorResponses[404],
                    409: errorResponses[409]
                },
            },
        },
        async (request) => {
            toNotificationDto(await notifications.update(request.userId, request.params.id, request.body))
        }
    );

    app.delete<{ Params: Static<typeof IdParams> }> (
        '/notifications/:id',
        {
            schema: {
                tags: ['Notifications'],
                summary: 'Delete a notification',
                security,
                params: IdParams,
                response: {
                    204: Type.Null({ description: 'Deleted' }),
                    400: errorResponses[400],
                    401: errorResponses[401],
                    404: errorResponses[404]
                },
            },
        },
        async (request, reply) => {
            await notifications.remove(request.userId, request.params.id);
            return reply.status(200).send();
        }
    );
}