import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/shared/config';

const base = {
  DATABASE_URL: 'postgresql://x',
  JWT_SECRET: 'a'.repeat(32),
};

describe('loadConfig', () => {
  it('loads defaults', () => {
    const c = loadConfig(base);
    expect(c.port).toBe(3000);
    expect(c.worker.maxAttempts).toBe(5);
  });

  it('refuses to start without JWT_SECRET', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgresql://x' })).toThrow(ConfigError);
  });

  it('rejects a short JWT_SECRET', () => {
    expect(() => loadConfig({ ...base, JWT_SECRET: 'short' })).toThrow(/32/);
  });

  it('rejects invalid numeric values', () => {
    expect(() => loadConfig({ ...base, PORT: 'abc' })).toThrow(ConfigError);
  });
});