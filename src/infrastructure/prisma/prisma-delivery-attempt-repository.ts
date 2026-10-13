import type {
     DeliveryAttempt,
     DeliveryOutcome,
     NewDeliveryAttempt
} from "../../domain/delivery-attempts";
import type { DeliveryAttemptRepository } from "../../domain/ports";
import type { PrismaClient } from "./client";
import type { Prisma } from "./generated/client";

export class PrismaDeliveryAttemptRepository implements DeliveryAttemptRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async record(data: NewDeliveryAttempt): Promise<void> {
        try {
            await this.prisma.deliveryAttempt.create({
                data: {
                    notificationId: data.notificationId,
                    channel: data.channel,
                    outcome: data.outcome,
                    reason: data.reason ?? null,
                    details: data.details as Prisma.InputJsonValue,
                    attemptedAt: data.attemptedAt
                }
            });
        } catch(error) {
            // P2003: the notification was deleted while being processed; there is nothing to attach history to.
            if ((error as { code?: string }).code === 'P2003') return;
            throw error;
        }
    }

    async listByNotification(notificationId: string): Promise<DeliveryAttempt[]> {
        const rows = await this.prisma.deliveryAttempt.findMany({
            where: { notificationId },
            orderBy: { attemptedAt: 'asc' }
        });

        return rows.map((row) => ({
            id: row.id,
            notificationId: row.notificationId,
            channel: row.channel,
            outcome: row.outcome as DeliveryOutcome,
            reason: row.reason,
            details: (row.details ?? {}) as Record<string, unknown>,
            attemptedAt: row.attemptedAt
        }));
    }
}