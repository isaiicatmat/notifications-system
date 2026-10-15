import { ConflictError, UnauthorizedError } from '../../src/domain/errors';
import {
    isEditable,
    NewNotification,
    Notification,
    NotificationPatch,
} from '../../src/domain/notification';
import type {
    NotificationRepository,
    PasswordHasher,
    TokenPayload,
    TokenService,
    UpdateOwnedResult,
    UserRepository,
} from '../../src/domain/ports';
import type { User } from '../../src/domain/user';

export class InMemoryUserRepository implements UserRepository {
    readonly users: User[] = [];

    async create(data: { email: string; passwordHash: string }): Promise<User> {
        if (this.users.some((u) => u.email === data.email)) throw new ConflictError('exists');
        const user = { id: `user-${this.users.length + 1}`, createdAt: new Date(), ...data };
        this.users.push(user);
        return user;
    }

    async findByEmail(email: string): Promise<User | null> {
        return this.users.find((u) => u.email === email) ?? null;
    }
}

export class FakePassworhHasher implements PasswordHasher {
    verifyCalls = 0;
    async hash(plain: string): Promise<string> {
        return `hashed:${plain}`;
    }
    async verify(hash: string, plain: string): Promise<boolean> {
        this.verifyCalls++;
        return hash === `hashed:${plain}`;
    }
}

export class FakeTokenService implements TokenService {
    async sign(payload: TokenPayload) {
        return { token: `token-for-${payload.userId}`, expiresIn: '1h' };
    }
    async verify(token: string): Promise<TokenPayload> {
        if (!token.startsWith('token-for')) throw new UnauthorizedError('bad-token');
        return { userId: token.replace('token-for-', '') };
    }
}

export class InMemoryNotificationRepository implements NotificationRepository {
    readonly items: Notification[] = [];
    private seq = 0;

    async create(data: NewNotification): Promise<Notification> {
        const now = new Date();
        const notification: Notification = {
            id: `notification-${++this.seq}`,
            status: 'pending',
            attempts: 0,
            lockedAt: null,
            createdAt: now,
            updatedAt: now,
            ...data,
        };
        this.items.push(notification);
        return notification;
    }

    async listByUser(userId: string): Promise<Notification[]> {
        return this.items.filter((notification) => notification.userId === userId).reverse();
    }

    async findOwned(id: string, userId: string): Promise<Notification | null> {
        return (
            this.items.find(
                (notification) => notification.id === id && notification.userId === userId,
            ) ?? null
        );
    }

    async updateOwned(
        id: string,
        userId: string,
        patch: NotificationPatch,
        nextAttemptAt: Date,
    ): Promise<UpdateOwnedResult> {
        const notification = await this.findOwned(id, userId);
        if (!notification) return { kind: 'not_found' };
        if (!isEditable(notification.status)) return { kind: 'not_editable' };
        Object.assign(notification, patch, { status: 'pending', attempts: 0, nextAttemptAt });
        return { kind: 'updated', notification };
    }

    async deleteOwned(id: string, userId: string): Promise<boolean> {
        const index = this.items.findIndex(
            (notification) => notification.id === id && notification.userId === userId,
        );
        if (index === -1) return false;
        this.items.splice(index, 1);
        return true;
    }
}
