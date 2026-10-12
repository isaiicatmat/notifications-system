import type { NewNotification, Notification, NotificationPatch } from "../../domain/notification";
import type { NotificationRepository, UpdateOwnedResult } from "../../domain/ports";
import type { PrismaClient } from "./client";

export class PrismaNotificationRepository implements NotificationRepository {
    constructor(private readonly prisma: PrismaClient) {}

    create(data: NewNotification): Promise<Notification> {
        return this.prisma.notification.create({ data });
    }

    listByUser(userId: string): Promise<Notification[]> {
        return this.prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });
    }

    findOwned(id: string, userId: string): Promise<Notification | null> {
        return this.prisma.notification.findFirst({ where: { id, userId } });
    }

    async updateOwned(
        id: string,
        userId: string,
        patch: NotificationPatch,
        nextAttemptAt: Date
    ): Promise<UpdateOwnedResult> {
        
        const { count } = await this.prisma.notification.updateMany({
            where: { id, userId, status: { in: ['pending', 'failed'] } },
            data: { ...patch, status: 'pending', attempts: 0, nextAttemptAt, lockedAt: null }
        });
        const notification = await this.findOwned(id, userId);
        if (count === 0) return { kind: notification ? 'not_editable' : 'not_found' };
        return notification ? { kind: 'updated', notification } : { kind: 'not_found'};
    }

    async deleteOwned(id: string, userId: string): Promise<boolean> {
        const { count } = await this.prisma.notification.deleteMany({ where: { id, userId } });
        return count > 0;
    }
}