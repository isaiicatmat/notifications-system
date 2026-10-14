import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Channel, ChannelMessage, DeliveryResult } from "../../src/domain/channel";
import { createDefaultChannelRegistry } from "../../src/infrastructure/channels";
import { systemClock } from "../../src/shared/system-clock";
import { createTestContext, registerAndLogin, resetDatabase, type TestContext } from "./helper";

/**
 * A brand-new channel defined only in this test. Adding it touches no existing channel,
 * worker, service, route or schema: it is implemented and registered, nothing else.
 */

class WebhookChannel implements Channel {
    readonly name = 'webhook';
    readonly delivered: string[] = [];

    async send(message: ChannelMessage): Promise<DeliveryResult> {
        if (!message.recipient.startsWith('https://')) {
            return { outcome: 'permanent', reason: 'Webhook URL must use https', details: {} };
        }

        this.delivered.push(message.id);
        return { outcome: 'sent', details: { url: message.recipient, status: 200 } };
    }
}

let context: TestContext;
const webhook = new WebhookChannel();

beforeAll(async () => {
    context = await createTestContext({
        channels: createDefaultChannelRegistry(systemClock).register(webhook)
    });
    await resetDatabase(context.container);
});
afterAll(() => context.close());

describe('adding a new channel', () => {
    it('can be created and delivered through without changing existing code', async () => {
        const { headers } = await registerAndLogin(context.app);
        const create = (channel: string, recipient: string) =>
            context.app.inject({
                method: 'POST',
                url: '/notifications',
                headers,
                payload: { title: 'Hi', content: 'Body', channel, recipient }
            });
        const hook = await create('webhook', 'https://example.com/hook');
        expect(hook.statusCode).toBe(201);

        const email = await create('email', 'carlos@test.com');
        
        await context.container.deliveryService.runOnce();

        const rows = await context.container.prisma.notification.findMany();
        expect(rows.every((r) => r.status === 'sent')).toBe(true);
        expect(webhook.delivered).toEqual([hook.json().id]);

        const [emailAttempt] = await context.container.prisma.deliveryAttempt.findMany({
            where: { notificationId: email.json().id }
        });
        expect(emailAttempt?.details).toMatchObject({ to: 'carlos@test.com', subject: 'Hi' });
    });

    it('is listed among the supported channels', async () => {
        const { headers } = await registerAndLogin(context.app, 'other@test.com');
        const res = await context.app.inject({
            method: 'POST',
            url: '/notifications',
            headers,
            payload: { title: 'Hi', content: 'Body', channel: 'fax', recipient: 'someone' }
        });
        expect(res.json().message).toMatch(/email, sms, push, webhook/);
    });
});