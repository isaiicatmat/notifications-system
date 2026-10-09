import { UnauthorizedError, ValidationError } from "../domain/errors";
import type { PasswordHasher, TokenService, UserRepository } from "../domain/ports";

export const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RegisteredUser {
    id: string,
    email: string
}

export interface LoginResult {
    accessToken: string;
    tokenType: 'Bearer',
    expiresIn: string
}

const INVALID_CREDENTIALS = 'Invalid email or password';

export class AuthService {
    private dummyHash: Promise<string> | undefined;

    constructor(
        private readonly users: UserRepository,
        private readonly hasher: PasswordHasher,
        private readonly tokens: TokenService
    ) {}

    async register(email: string, password: string): Promise<RegisteredUser> {
        const normalized = normalizeEmail(email);
        if (!EMAIL_PATTERN.test(normalized)) throw new ValidationError('Email format is invalid');
        if (password.length < MIN_PASSWORD_LENGTH) {
            throw new ValidationError(`Password must have at least ${MIN_PASSWORD_LENGTH} characters`);
        }
        const passwordHash = await this.hasher.hash(password);
        const user = await this.users.create({ email: normalized, passwordHash});
        return { id: user.id, email: user.email };
    }

    async login(email: string, password: string): Promise<LoginResult> {
        const user = await this.users.findByEmail(normalizeEmail(email));
        if (!user) {
            //dummy avoids revealing which accounts exists. 
            // A rapid response makes it easy to know
            this.dummyHash ??= this.hasher.hash('dummy-password-for-timig');
            await this.hasher.verify(await this.dummyHash, password);
            throw new UnauthorizedError(INVALID_CREDENTIALS);
        }

        if (! (await this.hasher.verify(user.passwordHash, password))) {
            throw new UnauthorizedError(INVALID_CREDENTIALS);
        }

        const { token, expiresIn } = await this.tokens.sign({ userId: user.id });
        return { accessToken: token, tokenType: 'Bearer', expiresIn };
    }

    async authenticate(token: string): Promise<{ userId: string }> {
        return this.tokens.verify(token);
    }
}

export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}