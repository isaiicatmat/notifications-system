export interface AppConfig {
  nodeEnv: string;
  port: number;
  host: string;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  swaggerEnabled: boolean;
  worker: {
    inProcess: boolean;
    pollIntervalMs: number;
    batchSize: number;
    maxAttempts: number;
    backoffBaseMs: number;
    lockTimeoutMs: number;
  };
}

type Env = Record<string, string | undefined>;

export class ConfigError extends Error {}

function required(env: Env, key: string): string {
  const value = env[key];
  if (value === undefined || value.trim() === '') {
    throw new ConfigError(`Missing required environment variable: ${key}`);
  }
  return value;
}

function int(env: Env, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ConfigError(`Environment variable ${key} must be a positive integer`);
  }
  return n;
}

function bool(env: Env, key: string, fallback: boolean): boolean {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

/** Reads and validates configuration; fails fast with a clear message. */
export function loadConfig(env: Env = process.env): AppConfig {
  const jwtSecret = required(env, 'JWT_SECRET');
  if (jwtSecret.length < 32) {
    throw new ConfigError('JWT_SECRET must be at least 32 characters long');
  }
  return {
    nodeEnv: env.NODE_ENV ?? 'development',
    port: int(env, 'PORT', 3000),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl: required(env, 'DATABASE_URL'),
    jwtSecret,
    jwtExpiresIn: env.JWT_EXPIRES_IN ?? '1h',
    swaggerEnabled: bool(env, 'SWAGGER_ENABLED', true),
    worker: {
      inProcess: bool(env, 'WORKER_IN_PROCESS', false),
      pollIntervalMs: int(env, 'WORKER_POLL_INTERVAL_MS', 1000),
      batchSize: int(env, 'WORKER_BATCH_SIZE', 10),
      maxAttempts: int(env, 'WORKER_MAX_ATTEMPTS', 5),
      backoffBaseMs: int(env, 'WORKER_BACKOFF_BASE_MS', 2000),
      lockTimeoutMs: int(env, 'WORKER_LOCK_TIMEOUT_MS', 60000),
    },
  };
}
