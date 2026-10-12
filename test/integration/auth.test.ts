import { createSigner } from "fast-jwt";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestContext, registerAndLogin, resetDatabase, type TestContext } from "./helper";
import { TEST_JWT_SECRET } from "./test-env";

let context: TestContext;

beforeAll(async () => {
    context = await createTestContext();
});
afterAll(() => context.close());
beforeEach(() => resetDatabase(context.container));

const post = (url: string, payload: object) => context.app.inject({ method: 'POST', url, payload });
const PROTECTED_URL = '/me';

describe('POST /auth/register', () => {
    it('creates the user and never returns password data', async () => {
        const res = await post('/auth/register', {
            email: 'Ana@Example.com', 
            password: 'password123'
        });
        expect(res.statusCode).toBe(201);
        expect(res.json()).toEqual({ id: expect.any(String), email: 'ana@example.com' });
        expect(res.body).not.toMatch(/pass/i);
    });

    it('stores only a hash of the password', async() => {
        await post('/auth/register', { email: 'ana@example.com', password: 'password123' });
        const user = await context.container.prisma.user.findUniqueOrThrow({
            where: { email: 'ana@example.com' },
        });
        expect(user.passwordHash).toMatch(/^\$argon2id\$/);
        expect(user.passwordHash).not.toContain('password123');
    });

    it('responds 409 for a duplicate email, case-insensitively', async () => {
        await post('/auth/register', { email: 'ana@example.com', password: 'password123' });
        const res = await post('/auth/register', { email: 'ANA@example.com', password: 'password123' });
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe('CONFLICT');
        expect(await context.container.prisma.user.count()).toBe(1);
    });

    it('responds 400 for an invalid email or short password', async () => {
        expect( (await post('/auth/register', { email: 'no-an-email', password: 'password123' })).statusCode).toBe(400);
        expect( (await post('/auth/register', { email: 'test@gmail.com', password: 'short' })).statusCode).toBe(400);
        expect( (await post('/auth/register', {})).statusCode).toBe(400);
    });
});

describe('POST /auth/login', () => {
    beforeEach(async () => {
        await post('/auth/register', { email: 'ana@example.com', password: 'password123' });
    });

    it('returns an access token for valid credentials', async () => {
        const res = await post('/auth/login', { email: 'ana@example.com', password: 'password123' });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ accessToken: expect.any(String), tokenType: 'Bearer' });
    })

    it('responds 401 with the same message for wrong password and unknown email', async () => {
        const wrongPassword = await post('/auth/login', { email: 'ana@example.com', password: 'wrong-password' });
        const unknownUser = await post('/auth/login', { email: 'ghost@example.com', password: 'password123' });
        expect(wrongPassword.statusCode).toBe(401);
        expect(unknownUser.statusCode).toBe(401);
        expect(unknownUser.json()).toEqual(wrongPassword.json());
    });
});

describe('protected endpoint', () => {
    const get = (authorization?: string) => 
        context.app.inject({
            method: 'GET',
            url: PROTECTED_URL,
            headers: authorization ? { authorization } : {}
        });
    
    it('serves public routes without a token', async () => {
        const response = await context.app.inject({ method: 'GET', url: '/health' });
        expect(response.statusCode).toBe(200);
    })

    it('responds 401 without a token', async () => {
        const response = await get();
        expect(response.statusCode).toBe(401);
    })

    it('responds 401 for a malformed or tampered token', async () => {
        const { token } = await registerAndLogin(context.app);
        const tampered = `${token.slice(0, -3)}abc`;
        for (const authorization of ['Bearer garbage', `Bearer ${tampered}`, 'Basic abc', token]) {
            const response = await get(authorization);
            expect(response.statusCode).toBe(401);
        }
    });

    it('responds 401 for an expired token or one signed with another secret', async () => {
        const { userId } = await registerAndLogin(context.app);
        const signWithShortExpiry = createSigner({ key: TEST_JWT_SECRET, expiresIn: 1 });
        const expiredToken = signWithShortExpiry({ sub: userId });

        const signWithForeignSecret = createSigner({ key: 'another-secret-another-secret-123456' });
        const forgedToken = signWithForeignSecret({ sub: userId });

        await new Promise((r) => setTimeout(r, 20));
        for (const token of [expiredToken, forgedToken]) {
            const response = await get(`Bearer ${token}`);
            expect(response.statusCode).toBe(401);
        }
    });

    it('accepts a valid token and identifies the caller', async () => {
        const { headers, userId } = await registerAndLogin(context.app);
        const res = await get(headers.authorization);
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ id: userId });
    })
});