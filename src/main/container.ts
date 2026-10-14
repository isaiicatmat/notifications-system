import { AuthService } from '../application/auth-service';
import type { ChannelRegistry } from '../application/channel-registry';
import { DeliveryHistoryService } from '../application/delivery-history-service';
import { DeliveryService } from '../application/delivery-service';
import { NotificationService } from '../application/notification-service';
import type { Clock } from '../domain/ports';
import { createDefaultChannelRegistry } from '../infrastructure/channels';
import { createPrismaClient, type PrismaClient } from '../infrastructure/prisma/client';
import { PrismaDeliveryAttemptRepository } from '../infrastructure/prisma/prisma-delivery-attempt-repository';
import { PrismaDeliveryQueue } from '../infrastructure/prisma/prisma-delivery-queue';
import { PrismaNotificationRepository } from '../infrastructure/prisma/prisma-notification-repository';
import { PrismaUserRepository } from '../infrastructure/prisma/prisma-user-repository';
import { Argon2PasswordHasher } from '../infrastructure/security/argon2-password-hasher';
import { JwtTokenService } from '../infrastructure/security/jwt-token-service';
import { DeliveryWorker, type WorkerLogger } from '../infrastructure/worker/delivery-worker';
import type { AppDependencies } from '../presentation/http/app';
import type { AppConfig } from '../shared/config';
import { systemClock } from '../shared/system-clock';

export interface Container {
  prisma: PrismaClient;
  app: AppDependencies;
  deliveryService: DeliveryService;
  createWorker(logger: WorkerLogger): DeliveryWorker;
  close(): Promise<void>;
}

export interface ContainerOptions {
  logger?: boolean;
  channels?: ChannelRegistry;
  clock?: Clock;
}

/** Composition root: the only place where concrete implementations are wired to ports. */
export function createContainer(config: AppConfig, options: ContainerOptions = {}): Container {
  const clock = options.clock ?? systemClock;
  const prisma = createPrismaClient(config.databaseUrl);
  const channels = options.channels ?? createDefaultChannelRegistry(clock);

  const userRepository = new PrismaUserRepository(prisma);
  const notificationRepository = new PrismaNotificationRepository(prisma);
  const attemptRepository = new PrismaDeliveryAttemptRepository(prisma);
  const queue = new PrismaDeliveryQueue(prisma);

  const tokens = new JwtTokenService(config.jwtSecret, config.jwtExpiresIn);
  const authService = new AuthService(userRepository, new Argon2PasswordHasher(), tokens);
  const notificationService = new NotificationService(notificationRepository, channels, clock);
  const deliveryHistoryService = new DeliveryHistoryService(
    notificationRepository,
    attemptRepository,
  );
  const deliveryService = new DeliveryService(queue, attemptRepository, channels, clock, {
    batchSize: config.worker.batchSize,
    maxAttempts: config.worker.maxAttempts,
    backoffBaseMs: config.worker.backoffBaseMs,
    lockTimeoutMs: config.worker.lockTimeoutMs,
  });

  return {
    prisma,
    app: { 
        authService, 
        notificationService, 
        deliveryHistoryService, 
        swaggerEnabled: config.swaggerEnabled, 
        logger: options.logger 
    },
    deliveryService,
    createWorker: (logger) =>
      new DeliveryWorker(
        deliveryService,
        config.worker.pollIntervalMs,
        config.worker.batchSize,
        logger,
      ),
    close: () => prisma.$disconnect(),
  };
}