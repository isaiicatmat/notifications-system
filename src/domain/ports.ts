import type { DeliveryAttempt, NewDeliveryAttempt } from "./delivery-attempts";
import type { NewNotification, Notification, NotificationPatch } from "./notification";
import type { User } from "./user";

export interface Clock {
    now(): Date;
}

export interface passwordHasher {
    hash(plain: string): Promise<string>;
    verify(hash: string, plain: string): Promise<boolean>;
}

export interface TokenPayload {
    userId: string;
}

export interface TokenService {
    sign(pyload: TokenPayload): Promise<{ token: string; expiresIn: string}>;
    verify(token: string): Promise<TokenPayload>
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
        nextAttemptAt: Date
    ): Promise<UpdateOwnedResult>;
    deleteOwned(id: string, userId: string): Promise<boolean>;
}

export interface DeliveryQueue {
    claimDue(now: Date, limit: number): Promise<Notification[]>;
    recoverStale(olderThan: Date): Promise<number>;
    markSent(id: string): Promise<boolean>;
    markFailed(id: string): Promise<boolean>;
    scheduleRetry(id: string, nextAttemptAt: Date): Promise<boolean>;
}

export interface DeliveryAttemptRepository {
    record(data: NewDeliveryAttempt): Promise<void>;
    listByNotification(notificationId: string): Promise<DeliveryAttempt[]>;
}