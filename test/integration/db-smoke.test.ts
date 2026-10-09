import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { TEST_DATABASE_URL } from './test-env';

describe('test database', () => {
  it('is reachable', async () => {
    const client = new Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    const res = await client.query('select 1 as ok');
    await client.end();
    expect(res.rows[0].ok).toBe(1);
  });
});