import { beforeEach, describe, expect, it } from 'vitest';
import { ChannelRegistry } from '../../src/application/channel-registry';
import { NotificationService } from '../../src/application/notification-service';
import { ConflictError, NotFoundError, ValidationError } from '../../src/domain/errors';
import { InMemoryNotificationRepository } from './helper';

const channel = (name: string) => ({
    name,
    send: async () => ({ outcome: 'sent' as const, details: {} }),
});

const valid = { title: 'Hi', content: 'Hello', channel: 'email', recipient: 'a@b.co' };

let repo: InMemoryNotificationRepository;
let service: NotificationService;

beforeEach(() => {
    repo = new InMemoryNotificationRepository();
    service = new NotificationService(
        repo,
        new ChannelRegistry().register(channel('email')).register(channel('sms')),
        { now: () => new Date() },
    );
});

describe('create', () => {
    it('stores a pending notification owned by the caller', async () => {
        const notification = await service.create('u1', valid);
        expect(notification).toMatchObject({
            userId: 'u1',
            status: 'pending',
            channel: 'email',
            attempts: 0,
        });
    });

    it('trims input', async () => {
        const notification = await service.create('u1', { ...valid, title: '   Hi   ' });
        expect(notification.title).toBe('Hi');
    });

    it('rejects an unsopported channel and lists the supported ones', async () => {
        const err = await service.create('u1', { ...valid, channel: 'fax' }).catch((e) => e);
        expect(err).toBeInstanceOf(ValidationError);
        expect(err.message).toContain('email, sms');
        expect(repo.items).toHaveLength(0);
    });

    it.each(['title', 'content', 'channel', 'recipient'] as const)(
        'rejects an empty %s',
        async (field) => {
            await expect(
                service.create('u1', { ...valid, [field]: '    ' }),
            ).rejects.toBeInstanceOf(ValidationError);
        },
    );
});

describe('list', () => {
    it('returns only the caller notifications', async () => {
        await service.create('u1', valid);
        await service.create('u2', valid);
        const mine = await service.list('u1');
        expect(mine).toHaveLength(1);
        expect(mine[0]?.userId).toBe('u1');
    });
});

describe('update', () => {
    it('updated a pending notification', async () => {
        const notification = await service.create('u1', valid);
        const updated = await service.update('u1', notification.id, {
            title: 'New',
            channel: 'sms',
        });
        expect(updated).toMatchObject({ title: 'New', channel: 'sms', status: 'pending' });
    });

    it('re-ques a failed notification (status back to pending, attempts reset', async () => {
        const notification = await service.create('u1', valid);
        Object.assign(notification, { status: 'failed', attempts: 5 });
        const updated = await service.update('u1', notification.id, { content: 'fixed' });
        expect(updated).toMatchObject({ status: 'pending', attempts: 0 });
    });

    it.each(['sent', 'processing'] as const)(
        'rejects editing a %s notification with a conflict',
        async (status) => {
            const notification = await service.create('u1', valid);
            notification.status = status;
            await expect(
                service.update('u1', notification.id, { title: 'x' }),
            ).rejects.toBeInstanceOf(ConflictError);
            expect(notification.title).toBe('Hi');
        },
    );

    it('reject an empty patch and an unsopported channel', async () => {
        const notification = await service.create('u1', valid);
        await expect(service.update('u1', notification.id, {})).rejects.toBeInstanceOf(
            ValidationError,
        );
        await expect(
            service.update('u1', notification.id, { channel: 'fax' }),
        ).rejects.toBeInstanceOf(ValidationError);
    });

    it("treats another user's notification as not found", async () => {
        const notification = await service.create('u1', valid);
        await expect(service.update('u2', notification.id, { title: 'x' })).rejects.toBeInstanceOf(
            NotFoundError,
        );
    });
});

describe('remove', () => {
    it('deletes own notification in any status', async () => {
        const notification = await service.create('u1', valid);
        notification.status = 'sent';
        await service.remove('u1', notification.id);
        expect(repo.items).toHaveLength(0);
    });

    it('does not delete or reveal notifications of other users', async () => {
        const notification = await service.create('u1', valid);
        await expect(service.remove('u2', notification.id)).rejects.toBeInstanceOf(NotFoundError);
        expect(repo.items).toHaveLength(1);
    });

    it('responds not found for unknown ids', async () => {
        await expect(service.remove('u1', 'missing')).rejects.toBeInstanceOf(NotFoundError);
    });
});
