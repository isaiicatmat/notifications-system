import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaDeliveryQueue } from '../../src/infrastructure/prisma/prisma-delivery-queue';
import { createTestContext, resetDatabase, seedNotifications, type TestContext } from './helper';

let context: TestContext;
let queue: PrismaDeliveryQueue;

beforeAll(async () => {
    context = await createTestContext();
    queue = new PrismaDeliveryQueue(context.container.prisma);
});
afterAll(() => context?.close());
beforeEach(() => resetDatabase(context.container));

const findRow = (id: string) =>
    context.container.prisma.notification.findUniqueOrThrow({
        where: { id },
    });

describe('claimDue', () => {
    it('moves due pending notifications to processing and counts the attempt', async () => {
        const { ids } = await seedNotifications(context.container, 3);
        const claimed = await queue.claimDue(new Date(), 10);
        expect(claimed.map((n) => n.id).sort()).toEqual([...ids].sort());
        expect(claimed.every((n) => n.status === 'processing' && n.attempts === 1)).toBe(true);
        expect(claimed[0]?.lockedAt).toBeInstanceOf(Date);
        expect(await queue.claimDue(new Date(), 10)).toEqual([]);
    });

    it('respects the batch size and oldest-first order', async () => {
        const { ids } = await seedNotifications(context.container, 5);
        const claimed = await queue.claimDue(new Date(), 2);
        expect(claimed).toHaveLength(2);
        expect(ids.slice(0, 2)).toEqual(expect.arrayContaining(claimed.map((n) => n.id)));
    });

    it('ignores notifications scheduled in the future', async () => {
        await seedNotifications(context.container, 1, {
            nextAttemptAt: new Date(Date.now() + 60_000),
        });
        expect(await queue.claimDue(new Date(), 10)).toEqual([]);
    });

    it('never gives the same notification to concurrent workers', async () => {
        const { ids } = await seedNotifications(context.container, 40);
        const workers = Array.from(
            { length: 6 },
            () => new PrismaDeliveryQueue(context.container.prisma),
        );
        const results = await Promise.all(workers.map((worker) => worker.claimDue(new Date(), 10)));

        const claimedIds = results.flat().map((n) => n.id);
        expect(new Set(claimedIds).size).toBe(claimedIds.length); //no duplicates
        expect(new Set(claimedIds)).toEqual(new Set(ids)); //nothing got lost

        const rows = await context.container.prisma.notification.findMany();
        expect(rows.every((r) => r.attempts === 1)).toBe(true);
    });
});

describe('recoverStale', () => {
    it('re-queues notifications whose lock is older than the timeout', async () => {
        const { ids } = await seedNotifications(context.container, 2);
        const [staleId, freshId] = ids as [string, string];

        await context.container.prisma.notification.update({
            where: { id: staleId },
            data: { status: 'processing', lockedAt: new Date(Date.now() - 10 * 60_000) },
        });

        await context.container.prisma.notification.update({
            where: { id: freshId },
            data: { status: 'processing', lockedAt: new Date() },
        });

        expect(await queue.recoverStale(new Date(Date.now() - 60_000))).toBe(1);
        expect(await findRow(staleId)).toMatchObject({ status: 'pending', lockedAt: null });
        expect((await findRow(freshId)).status).toBe('processing');
    });
});

describe('finishing a claimed notification', () => {
    it('marks sent, failed or schedule a retry only from processing', async () => {
        const { ids } = await seedNotifications(context.container, 3);
        const [sentId, failedId, retryId] = ids as [string, string, string];
        await queue.claimDue(new Date(), 10);
        const retryAt = new Date(Date.now() + 30_000);

        expect(await queue.markSent(sentId)).toBe(true);
        expect(await queue.markFailed(failedId)).toBe(true);
        expect(await queue.scheduleRetry(retryId, retryAt)).toBe(true);

        expect((await findRow(sentId)).status).toBe('sent');
        expect((await findRow(failedId)).status).toBe('failed');
        const retried = await findRow(retryId);
        expect(retried.status).toBe('pending');
        expect(retried.nextAttemptAt.getTime()).toBe(retryAt.getTime());

        // Already finished: further updates are ignored.
        expect(await queue.markFailed(sentId)).toBe(false);
    });

    it('returns false when the notification was deleted meanwhile', async () => {
        const { ids } = await seedNotifications(context.container, 1);
        const [id] = ids as [string];
        await queue.claimDue(new Date(), 10);
        await context.container.prisma.notification.delete({ where: { id } });
        expect(await queue.markSent(id)).toBe(false);
    });
});
