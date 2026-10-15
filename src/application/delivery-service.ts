import type { DeliveryResult } from '../domain/channel';
import type { Notification } from '../domain/notification';
import type { Clock, DeliveryAttemptRepository, DeliveryQueue } from '../domain/ports';
import { backoffDelayMs } from './backoff';
import type { ChannelRegistry } from './channel-registry';

export interface DeliveryOptions {
    batchSize: number;
    maxAttempts: number;
    backoffBaseMs: number;
    lockTimeoutMs: number;
}

export class DeliveryService {
    constructor(
        private readonly queue: DeliveryQueue,
        private readonly attempts: DeliveryAttemptRepository,
        private readonly channels: ChannelRegistry,
        private readonly clock: Clock,
        private readonly options: DeliveryOptions,
    ) {}

    async runOnce(
        onError: (error: unknown, notificationId: string) => void = () => undefined,
    ): Promise<number> {
        const now = this.clock.now();
        const lockedBefore = new Date(now.getTime() - this.options.lockTimeoutMs);
        await this.queue.recoverStale(lockedBefore, this.options.maxAttempts);
        const claimed = await this.queue.claimDue(now, this.options.batchSize);

        // Each delivery handles its own failure, so one error neither stops the batch nor goes unnoticed
        await Promise.all(
            claimed.map(async (notification) => {
                try {
                    await this.deliver(notification);
                } catch (error) {
                    onError(error, notification.id);
                }
            }),
        );
        return claimed.length;
    }

    private async deliver(notification: Notification): Promise<void> {
        const result = await this.send(notification);
        const exhausted =
            result.outcome === 'retryable' && notification.attempts >= this.options.maxAttempts;
        const reason = exhausted
            ? `${result.reason ?? 'Delivery failed'} (max attempts reached)`
            : result.reason;

        await this.attempts.record({
            notificationId: notification.id,
            channel: notification.channel,
            outcome: result.outcome,
            reason,
            details: result.details,
            attemptedAt: this.clock.now(),
        });

        if (result.outcome === 'sent') {
            await this.queue.markSent(notification.id);
        } else if (result.outcome === 'permanent' || exhausted) {
            await this.queue.markFailed(notification.id);
        } else {
            const delay = backoffDelayMs(notification.attempts, this.options.backoffBaseMs);
            await this.queue.scheduleRetry(
                notification.id,
                new Date(this.clock.now().getTime() + delay),
            );
        }
    }

    private async send(notification: Notification): Promise<DeliveryResult> {
        const channel = this.channels.get(notification.channel);
        if (!channel) {
            return {
                outcome: 'permanent',
                reason: `Unsupported channel "${notification.channel}"`,
                details: {},
            };
        }

        try {
            return await channel.send({
                id: notification.id,
                title: notification.title,
                content: notification.content,
                recipient: notification.recipient,
            });
        } catch (error) {
            return {
                outcome: 'retryable',
                reason: error instanceof Error ? error.message : 'Unexpected channel error',
                details: {},
            };
        }
    }
}
