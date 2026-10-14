import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ChannelRegistry } from "../../src/application/channel-registry";
import type { Channel, DeliveryResult } from "../../src/domain/channel";
import { 
    MutableClock,
    createTestContext,
    registerAndLogin,
    resetDatabase,
    type TestContext
} from "./helper";

const results: DeliveryResult[] = [
    { outcome: 'retryable', reason: 'timeout', details: { try: 1 } },
    { outcome: 'sent', details: { try: 2 } }
];
let call = 0;
const flaky: Channel = { name: 'email', send: async () => results[Math.min(call++, 1)]! };

let context: TestContext;
const clock = new MutableClock();
const payload = { title: 'Hi', content: 'Body', channel: 'email', recipient: 'a@b.co' };
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

beforeAll( async () => {
    context = await createTestContext({ clock, channels: new ChannelRegistry().register(flaky) });
});
afterAll(() => context?.close());
beforeEach(async () => {
    call = 0;
    await resetDatabase(context.container)
});

describe('GET /notifications/:id/deliveries', () => {
    it('returns the attempts in chronological order to the owner', async () => {
        const carlos = await registerAndLogin(context.app, 'carlos@test.com');
        const created = await context.app.inject({
            method:'POST',
            url: '/notifications',
            headers: carlos.headers,
            payload
        });
        const { id } = created.json();

        await context.container.deliveryService.runOnce();
        clock.advance(3600_000);
        await context.container.deliveryService.runOnce();

        const res = await context.app.inject({
            method: 'GET',
            url: `/notifications/${id}/deliveries`,
            headers: carlos.headers
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.map((a: { outcome: string }) => a.outcome)).toEqual(['retryable', 'sent']);
        expect(body[0]).toMatchObject({ channel: 'email', reason: 'timeout', details: { try: 1 }});
        expect(body[1]).toMatchObject({ reason: null, details: { try: 2 }});
    });

    it('responds 404 to other users and for unknown notifications, 401 without token', async () => {
        const carlos = await registerAndLogin(context.app, 'carlos@test.com');
        const alberto = await registerAndLogin(context.app, 'alberto@test.com');
        const created = await context.app.inject({
            method: 'POST',
            url: '/notifications',
            headers: carlos.headers,
            payload
        });
        const { id } = created.json();
        const get = (url: string, headers?: { authorization: string }) =>
            context.app.inject({ method: 'GET', url, headers });

        expect((await get(`/notifications/${id}/deliveries`, alberto.headers)).statusCode).toBe(404);
        expect((await get(`/notifications/${UNKNOWN_ID}/deliveries`, carlos.headers)).statusCode).toBe(404);
        expect((await get(`/notifications/${id}/deliveries`)).statusCode).toBe(401);
    });
})