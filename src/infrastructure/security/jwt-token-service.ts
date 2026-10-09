import { createSigner, createVerifier } from "fast-jwt";
import { UnauthorizedError } from "../../domain/errors";
import type { TokenPayload, TokenService } from "../../domain/ports";

export class JwtTokenService implements TokenService {
    private readonly signer;
    private readonly verifier;

    constructor(
        secret: string,
        private readonly expiresIn: string
    ) {
        this.signer = createSigner({ key: secret, algorithm: 'HS256', expiresIn });
        this.verifier = createVerifier({ key: secret, algorithms: ['HS256']});
    }

    async sign(payload: TokenPayload): Promise<{ token: string; expiresIn: string}> {
        const token = this.signer({ sub: payload.userId });
        return { token, expiresIn: this.expiresIn };
    }

    async verify(token: string): Promise<TokenPayload> {
        try {
            const decoded =  this.verifier(token) as { sub?: unknown };
            if (typeof decoded.sub !== 'string' || decoded.sub === '') throw new Error('missing sub');
            return { userId: decoded.sub };
        } catch {
            throw new UnauthorizedError('Invalid or expired token');
        }
    }
}