import { afterEach, describe, expect, it } from 'vitest';
import { ChannelRegistry } from '../../src/application/channel-registry';
import type { Channel, DeliveryResult } from '../../src/domain/channel';
import { createDefaultChannelRegistry } from '../../src/infrastructure/channels';
import {
    MutableClock,
    createGate,
    createTestContext,
    registerAndLogin,
    resetDatabase,
    waitForNotificationStatus,
    type TestContext,
    type TestContextOptions,
} from './helper';

const contexts: TestContext[] = [];
afterEach(async () => {
    await Promise.all(contexts.splice(0).map((c) => c.close()));
});

async function setup(options: TestContextOptions = {}) {
    const context = await createTestContext(options);
    contexts.push(context);
    await resetDatabase(context.container);
    const user = await registerAndLogin(context.app);
    const create = async (payload: object) => {
        const res = await context.app.inject({
            method: 'POST',
            url: '/notifications',
            headers: user.headers,
            payload,
        });
        expect(res.statusCode).toBe(201);
        return res.json() as { id: string };
    };

    const row = (id: string) =>
        context.container.prisma.notification.findUniqueOrThrow({ where: { id } });
    const attempts = (id: string) =>
        context.container.prisma.deliveryAttempt.findMany({
            where: { notificationId: id },
            orderBy: { attemptedAt: 'asc' },
        });
    return { context, user, create, row, attempts };
}

/** A channel whose results are scripted per call. */
function scriptedChannel(
    name: string,
    results: DeliveryResult[],
    onSend?: (id: string) => Promise<void>,
): Channel {
    let call = 0;
    return {
        name,
        async send(message) {
            await onSend?.(message.id);
            const index = Math.min(call, results.length - 1);
            call = call + 1;
            const result = results[index];
            if (!result) throw new Error('scriptedChannel needs at least one result');
            return result;
        },
    };
}

const retryable: DeliveryResult = { outcome: 'retryable', reason: 'provider timeout', details: {} };
const sent: DeliveryResult = { outcome: 'sent', details: { ok: true } };
const quietLogger = { info: () => undefined, error: () => undefined };

describe('delivery through the real channels', () => {
    it('delivers email, sms and push asynchronously and records the details', async () => {
        const clock = new MutableClock();
        const { context, create, row, attempts } = await setup({
            clock,
            channels: createDefaultChannelRegistry(clock),
        });
        const email = await create({
            title: 'Hi',
            content: 'Body',
            channel: 'email',
            recipient: 'ana@example.com',
        });
        const sms = await create({
            title: 'Hi',
            content: 'Body',
            channel: 'sms',
            recipient: '+14155550123',
        });
        const push = await create({
            title: 'Hi',
            content: 'Body',
            channel: 'push',
            recipient: 'device_token_'.padEnd(40, 'x'),
        });

        // Creation returns before delivery happens.
        expect((await row(email.id)).status).toBe('pending');
        expect(await context.container.deliveryService.runOnce()).toBe(3);

        for (const { id } of [email, sms, push]) expect((await row(id)).status).toBe('sent');
        expect((await attempts(email.id))[0]?.details).toMatchObject({
            to: 'ana@example.com',
            subject: 'Hi',
        });
        expect((await attempts(sms.id))[0]?.details).toMatchObject({
            to: '+14155550123',
            sentAt: clock.now().toISOString(),
        });
        expect((await attempts(push.id))[0]?.details).toMatchObject({
            status: 'delivered',
            payload: { notification: { title: 'Hi', body: 'Body' } },
        });
    });

    it('fails permanently with a recorded reason and no retry', async () => {
        const clock = new MutableClock();
        const { context, create, row, attempts } = await setup({
            clock,
            channels: createDefaultChannelRegistry(clock),
        });
        const tooLong = await create({
            title: 'Hi',
            content: 'x'.repeat(161),
            channel: 'sms',
            recipient: '+14155550123',
        });

        await context.container.deliveryService.runOnce();
        expect(await row(tooLong.id)).toMatchObject({ status: 'failed', attempts: 1 });
        const [attempt] = await attempts(tooLong.id);
        expect(attempt).toMatchObject({
            outcome: 'permanent',
            reason: expect.stringMatching(/160/),
        });

        clock.advance(24 * 3600_000);
        expect(await context.container.deliveryService.runOnce()).toBe(0);
    });
});

describe('retries', () => {
    it('retries a transient failure after the backoff delay, then succeeds', async () => {
        const clock = new MutableClock();
        const channels = new ChannelRegistry().register(
            scriptedChannel('email', [retryable, sent]),
        );
        const { context, create, row, attempts } = await setup({
            clock,
            channels,
            env: { WORKER_BACKOFF_BASE_MS: '1000' },
        });
        const notification = await create({
            title: 'Hi',
            content: 'Body',
            channel: 'email',
            recipient: 'a@b.com',
        });

        await context.container.deliveryService.runOnce();
        const afterFirst = await row(notification.id);
        expect(afterFirst).toMatchObject({ status: 'pending', attempts: 1, lockedAt: null });
        expect(afterFirst.nextAttemptAt.getTime()).toBe(clock.now().getTime() + 1000);

        expect(await context.container.deliveryService.runOnce()).toBe(0);
        clock.advance(1000);
        expect(await context.container.deliveryService.runOnce()).toBe(1);

        expect(await row(notification.id)).toMatchObject({ status: 'sent', attempts: 2 });
        const history = await attempts(notification.id);
        expect(history.map((a) => a.outcome)).toEqual(['retryable', 'sent']);
        expect(history[0]?.reason).toBe('provider timeout');
    });

    it('marks the notification failed when attempts are exhausted', async () => {
        const clock = new MutableClock();
        const channels = new ChannelRegistry().register(scriptedChannel('email', [retryable]));
        const { context, create, row, attempts } = await setup({
            clock,
            channels,
            env: {
                WORKER_MAX_ATTEMPTS: '3',
                WORKER_BACKOFF_BASE_MS: '10',
            },
        });
        const notification = await create({
            title: 'Hi',
            content: 'Body',
            channel: 'email',
            recipient: 'a@b.co',
        });

        for (let i = 0; i < 5; i++) {
            await context.container.deliveryService.runOnce();
            clock.advance(3600_000);
        }
        expect(await row(notification.id)).toMatchObject({ status: 'failed', attempts: 3 });
        const history = await attempts(notification.id);
        expect(history).toHaveLength(3);
        expect(history[2]?.reason).toMatch(/max attempts/);
    });

    it('treats a channel that throws as a transient failure', async () => {
        const throwing: Channel = {
            name: 'email',
            send: async () => {
                throw new Error('socket hang up');
            },
        };
        const { context, create, row, attempts } = await setup({
            clock: new MutableClock(),
            channels: new ChannelRegistry().register(throwing),
        });
        const notification = await create({
            title: 'Hi',
            content: 'Body',
            channel: 'email',
            recipient: 'a@b.co',
        });
        await context.container.deliveryService.runOnce();
        expect((await row(notification.id)).status).toBe('pending');
        expect((await attempts(notification.id))[0]).toMatchObject({
            outcome: 'retryable',
            reason: 'socket hang up',
        });
    });
});

describe('edge cases', () => {
    it('ignores a notification deleted while it was being delivered', async () => {
        let deleteDuringSend: (id: string) => Promise<void> = async () => undefined;
        const channels = new ChannelRegistry().register(
            scriptedChannel('email', [sent], (id) => deleteDuringSend(id)),
        );
        const { context, create } = await setup({ channels });
        deleteDuringSend = async (id) => {
            await context.container.prisma.notification.delete({ where: { id } });
        };
        await create({ title: 'Hi', content: 'Body', channel: 'email', recipient: 'a@b.com' });

        await expect(context.container.deliveryService.runOnce()).resolves.toBe(1);
        expect(await context.container.prisma.notification.count()).toBe(0);
        expect(await context.container.prisma.deliveryAttempt.count()).toBe(0);
    });

    it('never delivers a notification deleted before the worker runs', async () => {
        let sends = 0;
        const channels = new ChannelRegistry().register(
            scriptedChannel('email', [sent], async () => {
                sends++;
            }),
        );
        const { context, create, user } = await setup({ channels });
        const notification = await create({
            title: 'Hi',
            content: 'Body',
            channel: 'email',
            recipient: 'a@b.co',
        });
        await context.app.inject({
            method: 'DELETE',
            url: `/notifications/${notification.id}`,
            headers: user.headers,
        });
        expect(await context.container.deliveryService.runOnce()).toBe(0);
        expect(sends).toBe(0);
    });

    it('re-queues work left in processing by a crashed worker after the lock timeout', async () => {
        const clock = new MutableClock();
        const { context, create, row } = await setup({
            clock,
            env: { WORKER_LOCK_TIMEOUT_MS: '60000' },
        });
        const notification = await create({
            title: 'Hi',
            content: 'Body',
            channel: 'email',
            recipient: 'a@b.co',
        });

        await context.container.prisma.notification.update({
            where: { id: notification.id },
            data: { status: 'processing', lockedAt: clock.now() },
        });

        expect(await context.container.deliveryService.runOnce()).toBe(0);
        clock.advance(60_001);
        expect(await context.container.deliveryService.runOnce()).toBe(1);
        expect((await row(notification.id)).status).toBe('sent');
    });
});

describe('worker process', () => {
    it('delivers pending notifications that survived a restart', async () => {
        const first = await setup();
        const notification = await first.create({
            title: 'Hi',
            content: 'Body',
            channel: 'email',
            recipient: 'a@b.co',
        });
        await first.context.close();
        contexts.splice(contexts.indexOf(first.context), 1);

        const restarted = await createTestContext({ env: { WORKER_POLL_INTERVAL_MS: '20' } });
        contexts.push(restarted);

        const worker = restarted.container.createWorker(quietLogger);
        worker.start();
        try {
            await waitForNotificationStatus(restarted.container, notification.id, 'sent');
        } finally {
            await worker.stop();
        }
    });

    it('stop() waits for the batch in progess before resolving', async () => {
        const gate = createGate();
        let sending = false;
        const channels = new ChannelRegistry().register(
            scriptedChannel('email', [sent], async () => {
                sending = true;
                await gate.wait;
            }),
        );
        const { context, create, row } = await setup({
            channels,
            env: { WORKER_POLL_INTERVAL_MS: '20' },
        });
        const notification = await create({
            title: 'Hi',
            content: 'Body',
            channel: 'email',
            recipient: 'a@b.co',
        });

        const worker = context.container.createWorker(quietLogger);
        worker.start();
        await expect.poll(() => sending).toBe(true);

        let stopped = false;
        const stopping = worker.stop().then(() => {
            stopped = true;
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
        const stoppedWhileDelivering = stopped;

        gate.release();
        await stopping;

        expect(stoppedWhileDelivering).toBe(false);
        expect((await row(notification.id)).status).toBe('sent');
    });
});
