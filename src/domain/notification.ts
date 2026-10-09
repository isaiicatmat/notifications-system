export const NOTIFICATION_STATUSES = ['pending', 'processing', 'sent', 'failed'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export interface Notification {
    id: string;
    userId: string;
    title: string;
    content: string;
    channel: string;
    recipients: string;
    status: NotificationStatus;
    attempts: number;
    nextAttemptAt: Date;
    lockedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface NewNotification {
    userId: string;
    title: string;
    content: string;
    channel: string;
    recipient: string;
    nextAttemptAt: Date;
}

export interface NotificationPatch {
    title?: string;
    content?: string;
    channel?: string;
    recipient?: string;
}

const TRANSITIONS: Record<NotificationStatus, readonly NotificationStatus[]> = {
    pending: ['processing'],
    processing: ['sent', 'failed', 'pending'],
    sent: [],
    failed: ['pending']
}

export function canTransition(from: NotificationStatus, to: NotificationStatus): boolean {
    return TRANSITIONS[from].includes(to);
}

export function isEditable(status: NotificationStatus): boolean {
    return status === 'pending' || status === 'failed';
}