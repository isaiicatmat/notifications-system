import { beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "../../src/application/auth-service";
import { ConflictError, UnauthorizedError, ValidationError } from "../../src/domain/errors";
import { FakePassworhHasher, FakeTokenService, InMemoryUserRepository } from "./helper";

let users: InMemoryUserRepository;
let hasher: FakePassworhHasher;
let service: AuthService;

beforeEach(() => {
    users = new InMemoryUserRepository();
    hasher = new FakePassworhHasher();
    service = new AuthService(users, hasher, new FakeTokenService());
});

describe('AuthService.register', () => {
    it('creates an user with a hashed password and normalized email', async () => {
        const user = await service.register('  Ana@Example.COM ', 'password123');
        expect(user).toEqual({ id: 'user-1', email: 'ana@example.com' });
        expect(users.users[0]?.passwordHash).toBe('hashed:password123');
        expect(user).not.toHaveProperty('passwordHash');
    });

    it('rejects a duplicate email regardless of case', async () => {
        await service.register('ana@example.com', 'password123');
        await expect(service.register('ANA@example.com', 'password123')).rejects.toBeInstanceOf(ConflictError);
    });

    it('reject an invalid email', async () => {
        await expect(service.register('not-an-email', 'password123')).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects a short password', async () => {
        await expect(service.register('ana@exmaple.com', 'short')).rejects.toBeInstanceOf(ValidationError);
    });
});

describe('AuthService.login', () => {
    beforeEach(async () => {
        await service.register('ana@example.com', 'password123');
    });

    it('returns an access token for correct credentials', async() => {
        const result = await service.login('Ana@example.com', 'password123');
        expect(result).toEqual({ accessToken: 'token-for-user-1', tokenType: 'Bearer', expiresIn: '1h'});
    });

    it('returns the same error for a wrong password and an unknown email', async () => {
        const wrongPassword = await service.login('ana@example.com', 'nope-nope').catch((e) => e);
        const unknownEmail = await service.login('ghost@example.com', 'password123').catch((e) => e);
        expect(wrongPassword).toBeInstanceOf(UnauthorizedError);
        expect(unknownEmail).toBeInstanceOf(UnauthorizedError);
        expect(unknownEmail.message).toBe(wrongPassword.message);
    });

    it('still verifies a password hash for unknown emails', async () => {
        hasher.verifyCalls = 0;
        await service.login('ghost@example.com', 'password123').catch(() => undefined);
        expect(hasher.verifyCalls).toBe(1);
    });
});

describe('AuthService.authenticate', () => {
    it('resolves the user id from a valid token', async () => {
        await expect(service.authenticate('token-for-user-9')).resolves.toEqual({ userId: 'user-9'});
    });

    it('rejects an invalid token', async () => {
        await expect(service.authenticate('garbage')).rejects.toBeInstanceOf(UnauthorizedError);
    });
})