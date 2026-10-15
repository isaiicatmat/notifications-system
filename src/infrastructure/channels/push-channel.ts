import { Channel, ChannelMessage, DeliveryResult } from '../../domain/channel';
import { randomUUID } from 'node:crypto';

const DEVICE_TOKEN_MIN_LENGTH = 32;
const DEVICE_TOKEN_MAX_LENGTH = 4096;
/** Characters used by FCM/APNs tokens: letters, digits and _ : . - */
const DEVICE_TOKEN_CHARACTERS = /^[A-Za-z0-9_:.-]+$/;

function isValidDeviceToken(value: string): boolean {
    return (
        value.length >= DEVICE_TOKEN_MIN_LENGTH &&
        value.length <= DEVICE_TOKEN_MAX_LENGTH &&
        DEVICE_TOKEN_CHARACTERS.test(value)
    );
}

export class PushChannel implements Channel {
    readonly name = 'push';

    async send(message: ChannelMessage): Promise<DeliveryResult> {
        if (!isValidDeviceToken(message.recipient)) {
            return {
                outcome: 'permanent',
                reason: 'Invalid device token',
                details: { token: message.recipient },
            };
        }

        const payload = {
            token: message.recipient,
            notification: { title: message.title, body: message.content },
            data: { notificationId: message.id },
        };

        return {
            outcome: 'sent',
            details: { payload, status: 'delivered', messageId: `sim-push-${randomUUID()}` },
        };
    }
}
