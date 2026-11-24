import type { ClaimedNotification } from '../../domain/notification';
import type { DeliveryQueue } from '../../domain/ports';
import type { PrismaClient } from './client';
import { Prisma } from './generated/client';

export class PrismaDeliveryQueue implements DeliveryQueue {
    constructor(private readonly prisma: PrismaClient) {}

    /** Each claim gets a new random token (fencing token) that the worker must present to finish. */
    async claimDue(now: Date, limit: number): Promise<ClaimedNotification[]> {
        return this.prisma.$queryRaw<ClaimedNotification[]>(Prisma.sql`
            UPDATE notifications
            SET status = 'processing', locked_at = ${now}, claim_token = gen_random_uuid(),
                attempts = attempts + 1, updated_at = ${now}
            WHERE id IN (
                SELECT id FROM notifications
                WHERE status = 'pending' AND next_attempt_at <= ${now}
                ORDER BY next_attempt_at
                LIMIT ${limit}
                FOR UPDATE SKIP LOCKED
            )
            RETURNING id, user_id AS "userId", title, content, channel, recipient, status, attempts,
                next_attempt_at AS "nextAttemptAt", locked_at AS "lockedAt",
                claim_token::text AS "claimToken",
                created_at AS "createdAt", updated_at AS "updatedAt"
        `);
    }

    /**
     * One statement, so a row can't be failed by one update and re-queued by another.
     * Clearing the claim token invalidates the old worker's claim.
     * Returns how many rows went back to `pending`.
     */
    async recoverStale(olderThan: Date, maxAttempts: number): Promise<number> {
        const rows = await this.prisma.$queryRaw<{ status: string }[]>(Prisma.sql`
            UPDATE notifications
            SET status = CASE WHEN attempts >= ${maxAttempts}
                    THEN 'failed'::notification_status
                    ELSE 'pending'::notification_status
                END,
                locked_at = NULL, claim_token = NULL, updated_at = now()
            WHERE status = 'processing' AND locked_at < ${olderThan}
            RETURNING status::text AS status
        `);
        return rows.filter((row) => row.status === 'pending').length;
    }

    async markSent(id: string, claimToken: string): Promise<boolean> {
        return this.finish(id, claimToken, { status: 'sent' });
    }

    async markFailed(id: string, claimToken: string): Promise<boolean> {
        return this.finish(id, claimToken, { status: 'failed' });
    }

    async scheduleRetry(id: string, claimToken: string, nextAttemptAt: Date): Promise<boolean> {
        return this.finish(id, claimToken, { status: 'pending', nextAttemptAt });
    }

    /**
     * Only the current claim can finish a row. A deleted row, a row recovered as stale,
     * or a row re-claimed by another worker (new token) is left alone.
     */
    private async finish(
        id: string,
        claimToken: string,
        data: Prisma.NotificationUpdateManyMutationInput,
    ): Promise<boolean> {
        const { count } = await this.prisma.notification.updateMany({
            where: { id, status: 'processing', claimToken },
            data: { ...data, lockedAt: null, claimToken: null },
        });
        return count > 0;
    }
}
