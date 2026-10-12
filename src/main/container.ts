import { AuthService } from "../application/auth-service";
import { createPrismaClient, type PrismaClient } from "../infrastructure/prisma/client";
import { PrismaUserRepository } from "../infrastructure/prisma/prisma-user-repository";
import { Argon2PasswordHasher } from "../infrastructure/security/argon2-password-hasher";
import { JwtTokenService } from "../infrastructure/security/jwt-token-service";
import type { AppDependencies } from "../presentation/http/app";
import type { AppConfig } from "../shared/config";
import { ChannelRegistry } from "../application/channel-registry";
import { NotificationService } from "../application/notification-service";
import type { Clock } from "../domain/ports";
import { PrismaNotificationRepository } from "../infrastructure/prisma/prisma-notification-repository";
import { systemClock } from "../shared/system-clock";

export interface ContainerOptions {
    logger?: boolean,
    channels?: ChannelRegistry,
    clock?: Clock
}
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
    const clock = options.clock ?? systemClock;
    const channels = options.channels ?? new ChannelRegistry();
    const prisma = createPrismaClient(config.databaseUrl);
    const tokens = new JwtTokenService(config.jwtSecret, config.jwtExpiresIn);
    const authService = new AuthService(
        new PrismaUserRepository(prisma),
        new Argon2PasswordHasher(),
        tokens
    );
    const notificationService = new NotificationService(
        new PrismaNotificationRepository(prisma),
        channels,
        clock
    );

    return {
        prisma,
        app: {authService, notificationService, logger: options.logger },
        close: () =>prisma.$disconnect()
    }
}