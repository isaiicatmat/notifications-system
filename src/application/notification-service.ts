import { ConflictError, NotFoundError, ValidationError } from '../domain/errors';
import type { NewNotification, Notification, NotificationPatch } from '../domain/notification';
import type { Clock, NotificationRepository } from '../domain/ports';
import type { ChannelRegistry } from './channel-registry';

export type CreateNotificationInput = Omit<NewNotification, 'userId' | 'nextAttemptAt'>;

export class NotificationService {
    constructor(
        private readonly notifications: NotificationRepository,
        private readonly channels: ChannelRegistry,
        private readonly clock: Clock,
    ) {}

    async create(userId: string, input: CreateNotificationInput): Promise<Notification> {
        const data = this.sanitize(input) as CreateNotificationInput;
        for (const field of ['title', 'content', 'channel', 'recipient'] as const) {
            if (!data[field]) throw new ValidationError(`${field} is required`);
        }

        this.assertSupportChannel(data.channel);
        return this.notifications.create({ userId, ...data, nextAttemptAt: this.clock.now() });
    }

    list(userId: string): Promise<Notification[]> {
        return this.notifications.listByUser(userId);
    }

    async update(userId: string, id: string, patch: NotificationPatch): Promise<Notification> {
        const data = this.sanitize(patch);
        if (Object.keys(data).length === 0)
            throw new ValidationError('At least one field is required');
        for (const [field, value] of Object.entries(data)) {
            if (!value) throw new ValidationError(`${field} must not be empty`);
        }

        if (data.channel !== undefined) this.assertSupportChannel(data.channel);

        const result = await this.notifications.updateOwned(id, userId, data, this.clock.now());
        if (result.kind === 'not_found') throw new NotFoundError('Notification not found');
        if (result.kind === 'not_editable') {
            throw new ConflictError('Notification can no longer be modified');
        }

        return result.notification;
    }

    async remove(userId: string, id: string): Promise<void> {
        const deleted = await this.notifications.deleteOwned(id, userId);
        if (!deleted) throw new NotFoundError('Notification not found');
    }

    private sanitize(input: NotificationPatch): NotificationPatch {
        const out: NotificationPatch = {};
        for (const key of ['title', 'content', 'channel', 'recipient'] as const) {
            const value = input[key];
            if (value !== undefined) out[key] = value.trim();
        }

        return out;
    }

    private assertSupportChannel(channel: string): void {
        if (!this.channels.has(channel)) {
            throw new ValidationError(
                `Unsupported channel "${channel}". Supported channels: ${this.channels.names().join(', ')}`,
            );
        }
    }
}
