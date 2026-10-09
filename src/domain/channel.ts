import type { DeliveryOutcome } from "./delivery-attempts";

export interface ChannelMessage {
    id: string;
    title: string;
    content: string;
    recipient: string;
}

export interface DeliveryResult {
    outcome: DeliveryOutcome;
    details: Record<string, unknown>;
    reason?: string;
}

export interface Channel {
    readonly name: string;
    send(message: ChannelMessage): Promise<DeliveryResult>;
}