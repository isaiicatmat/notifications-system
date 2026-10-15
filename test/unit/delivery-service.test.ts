import { describe, expect, it } from 'vitest';
import { ChannelRegistry } from '../../src/application/channel-registry';
import { DeliveryService } from '../../src/application/delivery-service';
import type { Notification } from '../../src/domain/notification';
import type { DeliveryAttemptRepository, DeliveryQueue } from '../../src/domain/ports';

const notification: Notification = {
    id: 'n-1', userId: 'u-1', title: 'Hi', content: 'Body', channel: 'email', recipient: 'a@b.co',
    status: 'processing', attempts: 1, nextAttemptAt: new Date(), lockedAt: new Date(),
    createdAt: new Date(), updatedAt: new Date(),
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
        const service = new DeliveryService(queue, attempts, channels, { now: () => new Date() }, {
            batchSize: 10, maxAttempts: 5, backoffBaseMs: 1000, lockTimeoutMs: 60000,
        });

        const reported: string[] = [];
        await service.runOnce((_error, id) => reported.push(id));
        expect(reported).toEqual(['n-1']);
    });
});