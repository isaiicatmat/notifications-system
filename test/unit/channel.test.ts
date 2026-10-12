import { describe, expect, it } from 'vitest';
import { EmailChannel } from '../../src/infrastructure/channels/email-channel';
import { PushChannel } from '../../src/infrastructure/channels/push-channel';
import { SMS_MAX_LENGTH, SmsChannel } from '../../src/infrastructure/channels/sms-channel';

const msg = (recipient: string, content = 'Hello world') => ({
  id: 'n-1',
  title: 'Greetings',
  content,
  recipient,
});

describe('EmailChannel', () => {
  const channel = new EmailChannel();

  it('renders the template and records the delivery for a valid address', async () => {
    const result = await channel.send(msg('ana@example.com'));
    expect(result.outcome).toBe('sent');
    expect(result.details).toMatchObject({
      to: 'ana@example.com',
      subject: 'Greetings',
      messageId: expect.stringMatching(/^sim-email-/),
    });
    expect(result.details.html).toContain('<h1>Greetings</h1>');
    expect(result.details.text).toContain('Hello world');
  });

  it('escapes HTML in the template', async () => {
    const result = await channel.send(msg('ana@example.com', '<script>alert(1)</script>'));
    expect(result.details.html).not.toContain('<script>');
    expect(result.details.html).toContain('&lt;script&gt;');
  });

  it.each(['not-an-email', 'a@b', '', 'a b@c.com'])(
    'fails permanently for malformed recipient %j',
    async (to) => {
      const result = await channel.send(msg(to));
      expect(result.outcome).toBe('permanent');
      expect(result.reason).toMatch(/Invalid email/);
    },
  );
});

describe('SmsChannel', () => {
  const now = new Date('2026-01-02T03:04:05.000Z');
  const channel = new SmsChannel({ now: () => now });

  it('sends content of exactly 160 characters and records number and date', async () => {
    const result = await channel.send(msg('+14155550123', 'x'.repeat(SMS_MAX_LENGTH)));
    expect(result.outcome).toBe('sent');
    expect(result.details).toMatchObject({
      to: '+14155550123',
      length: 160,
      sentAt: '2026-01-02T03:04:05.000Z',
    });
  });

  it('fails permanently at 161 characters without truncating', async () => {
    const result = await channel.send(msg('+14155550123', 'x'.repeat(SMS_MAX_LENGTH + 1)));
    expect(result.outcome).toBe('permanent');
    expect(result.reason).toMatch(/160/);
    expect(result.details).not.toHaveProperty('body');
  });

  it.each(['14155550123', '+0123456', 'abc', '+1'])(
    'fails permanently for invalid number %j',
    async (to) => {
      const result = await channel.send(msg(to));
      expect(result.outcome).toBe('permanent');
      expect(result.reason).toMatch(/phone number/);
    },
  );
});

describe('PushChannel', () => {
  const channel = new PushChannel();
  const token = 'fcm_token:' + 'A1b2'.repeat(10);

  it('formats the payload and records the status for a valid token', async () => {
    const result = await channel.send(msg(token));
    expect(result.outcome).toBe('sent');
    expect(result.details).toMatchObject({
      status: 'delivered',
      payload: {
        token,
        notification: { title: 'Greetings', body: 'Hello world' },
        data: { notificationId: 'n-1' },
      },
    });
  });

  it.each(['short', 'has spaces in the token which is long enough to pass length', ''])(
    'fails permanently for invalid token %j',
    async (bad) => {
      const result = await channel.send(msg(bad));
      expect(result.outcome).toBe('permanent');
      expect(result.reason).toBe('Invalid device token');
    },
  );
});