import { randomUUID } from 'node:crypto';
import type { Channel, ChannelMessage, DeliveryResult } from '../../domain/channel';
import { isValidEmail } from '../../domain/email';

/** Makes user text safe to place inside HTML: special characters are shown, never interpreted as tags. */
function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;') // must be first, or it would re-escape the entities below
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

export class EmailChannel implements Channel {
    readonly name = 'email';

    async send(message: ChannelMessage): Promise<DeliveryResult> {
        if (!isValidEmail(message.recipient)) {
            return {
                outcome: 'permanent',
                reason: `Invalid email recipient: "${message.recipient}"`,
                details: { to: message.recipient },
            };
        }

        const subject = message.title;
        const html = `<h1>${escapeHtml(message.title)}</h1>\n<p>${escapeHtml(message.content)}</p>`;
        const text = `${message.title}\n\n${message.content}`;

        return {
            outcome: 'sent',
            details: {
                to: message.recipient,
                subject,
                html,
                text,
                messageId: `sim-email-${randomUUID()}`,
            },
        };
    }
}
