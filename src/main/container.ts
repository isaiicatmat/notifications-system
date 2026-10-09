import { AuthService } from "../application/auth-service";
import { createPrismaClient, type PrismaClient } from "../infrastructure/prisma/client";
import { PrismaUserRepository } from "../infrastructure/prisma/prisma-user-repository";
import { Argon2PasswordHasher } from "../infrastructure/security/argon2-password-hasher";
import { JwtTokenService } from "../infrastructure/security/jwt-token-service";
import type { AppDependencies } from "../presentation/http/app";
import type { AppConfig } from "../shared/config";

export interface Container {
    prisma: PrismaClient;
    app: AppDependencies;
    close(): Promise<void>;
}

export interface ContainerOptions {
    logger?: boolean;
}
/** Composition root: only place where concrete implementations are wired to ports */
export function createContainer(config: AppConfig, options: ContainerOptions = {}): Container {
    const prisma = createPrismaClient(config.databaseUrl);
    const tokens = new JwtTokenService(config.jwtSecret, config.jwtExpiresIn);
    const authService = new AuthService(
        new PrismaUserRepository(prisma),
        new Argon2PasswordHasher(),
        tokens
    );

    return {
        prisma,
        app: {authService, logger: options.logger },
        close: () =>prisma.$disconnect()
    }
}