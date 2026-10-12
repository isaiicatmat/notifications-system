import { ChannelRegistry } from '../../application/channel-registry';
import type { Clock } from '../../domain/ports';
import { EmailChannel } from './email-channel';
import { PushChannel } from './push-channel';
import { SmsChannel } from './sms-channel';

/**
 * The single place that lists the available channels.
 * To add a channel: implement `Channel` in this folder and register it here.
 */
export function createDefaultChannelRegistry(clock: Clock): ChannelRegistry {
  return new ChannelRegistry()
    .register(new EmailChannel())
    .register(new SmsChannel(clock))
    .register(new PushChannel());
}