import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { TEST_DATABASE_URL } from './test-env';

/** Applies migrations to the dedicated test database once before the integration suite. */
export default function setup(): void {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  if (!existsSync('prisma/migrations')) return;
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}