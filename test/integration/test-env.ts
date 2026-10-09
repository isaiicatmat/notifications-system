export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/notifications_test?schema=public';

export const TEST_JWT_SECRET = 'test-secret-test-secret-test-secret-123';