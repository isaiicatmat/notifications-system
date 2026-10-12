import { randomUUID } from "node:crypto";
import type { Channel, ChannelMessage, DeliveryResult } from "../../domain/channel";
import type { Clock } from "../../domain/ports";

export const SMS_MAX_LENGTH = 160;

const E164_MIN_DIGITS = 7;
const E164_MAX_DIGITS = 15;

/**
 * E.164 international format: "+" followed by 7 to 15 digits; the country code cannot start with 0.
 * Example: +14155550123
 */
function isE164PhoneNumber(value: string): boolean {
  if (!value.startsWith('+')) return false;
  const digits = value.slice(1);
  return (
    /^\d+$/.test(digits) &&
    digits.length >= E164_MIN_DIGITS &&
    digits.length <= E164_MAX_DIGITS &&
    !digits.startsWith('0')
  );
}

export class SmsChannel implements Channel {
    readonly name = 'sms';

    constructor(private readonly clock: Clock) {}

    async send(message: ChannelMessage): Promise<DeliveryResult> {
        if (!isE164PhoneNumber(message.recipient)) {
            return {
                outcome: 'permanent',
                reason: `Invalid phone number (expected E.164, e.g. +14155550123): "${message.recipient}"`,
                details: { to: message.recipient },
            };
        }

        if (message.content.length > SMS_MAX_LENGTH) {
            return {
                outcome: 'permanent',
                reason: `SMS content exceeds ${SMS_MAX_LENGTH} characters (${message.content.length})`,
                details: { to: message.recipient, length: message.content.length },
            };
        }

        return {
            outcome: 'sent',
            details: {
                to: message.recipient,
                body: message.content,
                length: message.content.length,
                sentAt: this.clock.now().toISOString(),
                messageId: `sim-sms-${randomUUID()}`,
            }
        };

    }
}