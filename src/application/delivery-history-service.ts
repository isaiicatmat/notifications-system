import type { DeliveryAttempt } from '../domain/delivery-attempts';
import { NotFoundError } from '../domain/errors';
import type { DeliveryAttemptRepository, NotificationRepository } from '../domain/ports';

export class DeliveryHistoryService {
    constructor(
        private readonly notifications: NotificationRepository,
        private readonly attempts: DeliveryAttemptRepository,
    ) {}

    async list(userId: string, notificationId: string): Promise<DeliveryAttempt[]> {
        const notification = await this.notifications.findOwned(notificationId, userId);
        if (!notification) throw new NotFoundError('Notification not found');
        return this.attempts.listByNotification(notificationId);
    }
}
