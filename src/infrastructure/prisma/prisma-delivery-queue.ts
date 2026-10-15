import type { Notification } from '../../domain/notification';
import type { DeliveryQueue } from '../../domain/ports';
import type { PrismaClient } from './client';
import { Prisma } from './generated/client';

export class PrismaDeliveryQueue implements DeliveryQueue {
    constructor(private readonly prisma: PrismaClient) {}

    async claimDue(now: Date, limit: number): Promise<Notification[]> {
        return this.prisma.$queryRaw<Notification[]>(Prisma.sql`
            UPDATE notifications
            SET status = 'processing', locked_at = ${now}, attempts = attempts + 1, updated_at = ${now}
            WHERE id IN (
                SELECT id FROM notifications
                WHERE status = 'pending' AND next_attempt_at <= ${now}
                ORDER BY next_attempt_at
                LIMIT ${limit}
                FOR UPDATE SKIP LOCKED
            )
            RETURNING id, user_id AS "userId", title, content, channel, recipient, status, attempts,
                next_attempt_at AS "nextAttemptAt", locked_at AS "lockedAt",
                created_at AS "createdAt", updated_at AS "updatedAt"
        `);
    }

    async recoverStale(olderThan: Date, maxAttempts: number): Promise<number> {
        const stale = { status: 'processing' as const, lockedAt: { lt: olderThan } };
        await this.prisma.notification.updateMany({
            where: { ...stale, attempts: { gte: maxAttempts } },
            data: { status: 'failed', lockedAt: null }
        });

        const { count } = await this.prisma.notification.updateMany({
            where: stale,
            data: { status: 'pending', lockedAt: null },
        });
        return count;
    }

    async markSent(id: string): Promise<boolean> {
        return this.finish(id, { status: 'sent', lockedAt: null });
    }

    async markFailed(id: string): Promise<boolean> {
        return this.finish(id, { status: 'failed', lockedAt: null });
    }

    async scheduleRetry(id: string, nextAttemptAt: Date): Promise<boolean> {
        return this.finish(id, { status: 'pending', nextAttemptAt, lockedAt: null });
    }

    /** Only rows still in `processing` are updated: a deleted or re-claimed row is left alone. */
    private async finish(
        id: string,
        data: Prisma.NotificationUpdateManyMutationInput,
    ): Promise<boolean> {
        const { count } = await this.prisma.notification.updateMany({
            where: { id, status: 'processing' },
            data,
        });
        return count > 0;
    }
}
