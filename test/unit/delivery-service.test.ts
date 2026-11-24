import { describe, expect, it } from 'vitest';
import { ChannelRegistry } from '../../src/application/channel-registry';
import { DeliveryService } from '../../src/application/delivery-service';
import type { ClaimedNotification } from '../../src/domain/notification';
import type { DeliveryAttemptRepository, DeliveryQueue } from '../../src/domain/ports';

const options = { batchSize: 10, maxAttempts: 5, backoffBaseMs: 1000, lockTimeoutMs: 60000 };

const notification: ClaimedNotification = {
    id: 'n-1',
    userId: 'u-1',
    title: 'Hi',
    content: 'Body',
    channel: 'email',
    recipient: 'a@b.co',
    status: 'processing',
    attempts: 1,
    nextAttemptAt: new Date(),
    lockedAt: new Date(),
    claimToken: 'claim-1',
    createdAt: new Date(),
    updatedAt: new Date(),
};

describe('DeliveryService.runOnce', () => {
    it('reports unexpected errors instead of swallowing them', async () => {
        const queue: DeliveryQueue = {
            claimDue: async () => [notification],
            recoverStale: async () => 0,
            markSent: async () => true,
            markFailed: async () => true,
            scheduleRetry: async () => true,
        };
        const attempts: DeliveryAttemptRepository = {
            record: async () => {
                throw new Error('connection lost');
            },
            listByNotification: async () => [],
        };
        const channels = new ChannelRegistry().register({
            name: 'email',
            send: async () => ({ outcome: 'sent', details: {} }),
        });
        const service = new DeliveryService(
            queue,
            attempts,
            channels,
            { now: () => new Date() },
            {
                batchSize: 10,
                maxAttempts: 5,
                backoffBaseMs: 1000,
                lockTimeoutMs: 60000,
            },
        );

        const reported: string[] = [];
        await service.runOnce((_error, id) => reported.push(id));
        expect(reported).toEqual(['n-1']);
    });

    it('finishes the delivery with the claim token it was given', async () => {
        const finished: string[] = [];
        const queue: DeliveryQueue = {
            claimDue: async () => [notification],
            recoverStale: async () => 0,
            markSent: async (id, claimToken) => {
                finished.push(`${id}:${claimToken}`);
                return true;
            },
            markFailed: async () => true,
            scheduleRetry: async () => true,
        };
        const attempts: DeliveryAttemptRepository = {
            record: async () => undefined,
            listByNotification: async () => [],
        };
        const channels = new ChannelRegistry().register({
            name: 'email',
            send: async () => ({ outcome: 'sent', details: {} }),
        });
        const service = new DeliveryService(
            queue,
            attempts,
            channels,
            { now: () => new Date() },
            options,
        );

        await service.runOnce();
        expect(finished).toEqual(['n-1:claim-1']);
    });
});
