import type { FastifyInstance } from "fastify";
import { createContainer, type Container } from "../../src/main/container";
import { buildApp } from "../../src/presentation/http/app";
import { loadConfig } from "../../src/shared/config";
import { TEST_DATABASE_URL, TEST_JWT_SECRET } from "./test-env";
import { ChannelRegistry } from "../../src/application/channel-registry";
import { Channel } from "../../src/domain/channel";
import { Clock } from "../../src/domain/ports";

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
    clock?: Clock
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
        close: async() => {
            await app.close();
            await container.close()
        },
    };
}

export async function resetDatabase(container: Container): Promise<void> {
    await container.prisma.$executeRawUnsafe(
        'TRUNCATE TABLE delivery_attempts, notifications, users RESTART IDENTITY CASCADE'
    );
}

export async function registerAndLogin(
    app: FastifyInstance,
    email = 'user@example.com',
    password = 'password123'
): Promise<{ token: string; userId: string; headers: { authorization: string }}> {
    const reg = await app.inject({ method: 'POST', url: '/auth/register', payload: { email, password } });
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password }});
    const token = login.json().accessToken as string;
    return { token, userId: reg.json().id as string, headers: { authorization: `Bearer ${token}` }}
}

export function stubChannels(...names: string[]): ChannelRegistry {
    const registry = new ChannelRegistry();
    for (const name of names) {
        const channel: Channel = { name, send: async () => ({ outcome: 'sent', details: {} }) };
        registry.register(channel);
    }

    return registry;
}

