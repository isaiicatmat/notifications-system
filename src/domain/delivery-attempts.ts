export type DeliveryOutcome = 'sent' | 'retryable' | 'permanent';

export interface DeliveryAttempt {
    id: string;
    notificationId: string;
    channel: string;
    outcome: DeliveryOutcome;
    reason: string | null;
    details: Record<string, unknown>;
    attemptedAt: Date;
}

export interface NewDeliveryAttempt {
    notificationId: string;
    channel: string;
    outcome: DeliveryOutcome;
    reason?: string;
    details: Record<string, unknown>;
    attemptedAt: Date;
}