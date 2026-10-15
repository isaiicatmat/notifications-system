import type { FastifyInstance } from 'fastify';
import { createContainer, type Container } from '../../src/main/container';
import { buildApp } from '../../src/presentation/http/app';
import { loadConfig } from '../../src/shared/config';
import { TEST_DATABASE_URL, TEST_JWT_SECRET } from './test-env';
import { ChannelRegistry } from '../../src/application/channel-registry';
import { Channel } from '../../src/domain/channel';
import { Clock } from '../../src/domain/ports';
import { NotificationStatus } from '../../src/domain/notification';
import { expect } from 'vitest';

const WAIT_TIMEOUT_MS = 5_000;
const WAIT_INTERVAL_MS = 50;

export interface TestContext {
    app: FastifyInstance;
    container: Container;
    close(): Promise<void>;
}

export function testConfig(overrides: Record<string, string> = {}) {
    return loadConfig({
        DATABASE_URL: TEST_DATABASE_URL,
        JWT_SECRET: TEST_JWT_SECRET,
        JWT_EXPIRES_IN: '1h',
        ...overrides,
    });
}

export interface TestContextOptions {
    env?: Record<string, string>;
    channels?: ChannelRegistry;
    clock?: Clock;
}

export async function createTestContext(options: TestContextOptions = {}): Promise<TestContext> {
    const container = createContainer(testConfig(options.env), {
        channels: options.channels ?? stubChannels('email', 'sms', 'push'),
        clock: options.clock,
    });

    const app = await buildApp(container.app);
    await app.ready();
    return {
        app,
        container,
        close: async () => {
            await app.close();
            await container.close();
        },
    };
}

export async function getNotificationStatus(container: Container, id: string) {
    const notification = await container.prisma.notification.findUniqueOrThrow({ where: { id } });
    return notification.status;
}

/** Waits until a background process (e.g. the worker) moves the notification to `status`. */
export async function waitForNotificationStatus(
    container: Container,
    id: string,
    status: NotificationStatus,
): Promise<void> {
    await expect
        .poll(() => getNotificationStatus(container, id), {
            timeout: WAIT_TIMEOUT_MS,
            interval: WAIT_INTERVAL_MS,
        })
        .toBe(status);
}

export async function resetDatabase(container: Container): Promise<void> {
    await container.prisma.$executeRawUnsafe(
        'TRUNCATE TABLE delivery_attempts, notifications, users RESTART IDENTITY CASCADE',
    );
}

export async function registerAndLogin(
    app: FastifyInstance,
    email = 'user@example.com',
    password = 'password123',
): Promise<{ token: string; userId: string; headers: { authorization: string } }> {
    const reg = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password },
    });
    const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password },
    });
    const token = login.json().accessToken as string;
    return {
        token,
        userId: reg.json().id as string,
        headers: { authorization: `Bearer ${token}` },
    };
}

export function stubChannels(...names: string[]): ChannelRegistry {
    const registry = new ChannelRegistry();
    for (const name of names) {
        const channel: Channel = { name, send: async () => ({ outcome: 'sent', details: {} }) };
        registry.register(channel);
    }

    return registry;
}

export async function seedNotifications(
    container: Container,
    pendingNotifications: number,
    overrides: Partial<{ channel: string; recipient: string; nextAttemptAt: Date }> = {},
): Promise<{ userId: string; ids: string[] }> {
    const user = await container.prisma.user.upsert({
        where: { email: 'seed@test.com' },
        update: {},
        create: { email: 'seed@test.com', passwordHash: 'x' },
    });

    const ids: string[] = [];

    for (let i = 0; i < pendingNotifications; i++) {
        const notification = await container.prisma.notification.create({
            data: {
                userId: user.id,
                title: `title ${i}`,
                content: `content ${i}`,
                channel: overrides.channel ?? 'email',
                recipient: overrides.recipient ?? 'seed@test.com',
                ...(overrides.nextAttemptAt ? { nextAttemptAt: overrides.nextAttemptAt } : {}),
            },
        });
        ids.push(notification.id);
    }
    return { userId: user.id, ids };
}

export class MutableClock implements Clock {
    constructor(private current = new Date()) {}

    now(): Date {
        return new Date(this.current);
    }

    advance(ms: number): void {
        this.current = new Date(this.current.getTime() + ms);
    }
}

/** A promise the test resolves manually: lets a fake channel "hang" until the test releases it. */
export function createGate(): { wait: Promise<void>; release: () => void } {
    let release: () => void = () => undefined;
    const wait = new Promise<void>((resolve) => {
        release = resolve;
    });
    return { wait, release: () => release() };
}