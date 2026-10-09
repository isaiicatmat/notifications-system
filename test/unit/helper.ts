import { ConflictError, UnauthorizedError } from "../../src/domain/errors";
import type { 
    PasswordHasher,
    TokenPayload,
    TokenService,
    UserRepository
} from "../../src/domain/ports";
import type { User } from "../../src/domain/user";

export class InMemoryUserRepository implements UserRepository {
    readonly users: User[] = [];

    async create(data: {email: string; passwordHash: string }): Promise<User> {
        if (this.users.some((u) => u.email === data.email)) throw new ConflictError('exists');
        const user = {id: `user-${this.users.length + 1}`, createdAt: new Date(), ...data };
        this.users.push(user);
        return user;
    }

    async findByEmail(email: string): Promise<User | null> {
        return this.users.find((u) => u.email === email) ?? null;
    }
}

export class FakePassworhHasher implements PasswordHasher {
    verifyCalls = 0;
    async hash(plain: string): Promise<string> {
        return `hashed:${plain}`;
    }
    async verify(hash: string, plain: string): Promise<boolean> {
        this.verifyCalls++;
        return hash === `hashed:${plain}`;
    }
}

export class FakeTokenService implements TokenService {
    async sign(payload: TokenPayload) {
        return { token: `token-for-${payload.userId}`, expiresIn: '1h' };
    }
    async verify(token: string): Promise<TokenPayload> {
        if (!token.startsWith('token-for')) throw new UnauthorizedError('bad-token');
        return { userId: token.replace('token-for-', '') };
    }
}