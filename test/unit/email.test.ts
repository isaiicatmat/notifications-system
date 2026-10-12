import { describe, expect, it } from 'vitest';
import { isValidEmail } from '../../src/domain/email';

describe('isValidEmail', () => {
  it.each(['ana@example.com', 'a.b+tag@sub.example.co'])('accepts %s', (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each(['', 'ana', 'ana@', '@example.com', 'ana@example', 'ana@.com', 'ana@example.', 'a@b@c.com', 'a b@c.com'])(
    'rejects %j',
    (email) => {
      expect(isValidEmail(email)).toBe(false);
    },
  );
});