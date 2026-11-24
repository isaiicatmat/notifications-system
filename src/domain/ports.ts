import type { DeliveryAttempt, NewDeliveryAttempt } from './delivery-attempts';
import type {
    ClaimedNotification,
    NewNotification,
    Notification,
    NotificationPatch,
} from './notification';
import type { User } from './user';

export interface Clock {
    now(): Date;
}

export interface PasswordHasher {
    hash(plain: string): Promise<string>;
    verify(hash: string, plain: string): Promise<boolean>;
}

export interface TokenPayload {
    userId: string;
}

export interface TokenService {
    sign(payload: TokenPayload): Promise<{ token: string; expiresIn: string }>;
    verify(token: string): Promise<TokenPayload>;
}

export interface UserRepository {
    create(data: { email: string; passwordHash: string }): Promise<User>;
    findByEmail(email: string): Promise<User | null>;
}

export type UpdateOwnedResult =
    | { kind: 'updated'; notification: Notification }
    | { kind: 'not_found' }
    | { kind: 'not_editable' };

export interface NotificationRepository {
    create(data: NewNotification): Promise<Notification>;
    listByUser(userId: string): Promise<Notification[]>;
    findOwned(id: string, userId: string): Promise<Notification | null>;
    updateOwned(
        id: string,
        userId: string,
        patch: NotificationPatch,
        nextAttemptAt: Date,
    ): Promise<UpdateOwnedResult>;
    deleteOwned(id: string, userId: string): Promise<boolean>;
}

/**
 * Finishing methods take the claim token returned by `claimDue` and return false when
 * that claim is no longer current (row deleted, recovered as stale, or re-claimed).
 */
export interface DeliveryQueue {
    claimDue(now: Date, limit: number): Promise<ClaimedNotification[]>;
    recoverStale(olderThan: Date, maxAttempts: number): Promise<number>;
    markSent(id: string, claimToken: string): Promise<boolean>;
    markFailed(id: string, claimToken: string): Promise<boolean>;
    scheduleRetry(id: string, claimToken: string, nextAttemptAt: Date): Promise<boolean>;
}

export interface DeliveryAttemptRepository {
    record(data: NewDeliveryAttempt): Promise<void>;
    listByNotification(notificationId: string): Promise<DeliveryAttempt[]>;
}
