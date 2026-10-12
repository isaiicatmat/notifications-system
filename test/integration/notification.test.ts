import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestContext, registerAndLogin, resetDatabase, type TestContext } from "./helper";

type Auth = { authorization: string };

let context: TestContext;
let carlos: Awaited<ReturnType<typeof registerAndLogin>>;
let alberto: Awaited<ReturnType<typeof registerAndLogin>>;

const valid = { title: 'Hello', content: 'World', channel: 'email', recipient: 'a@test.com' };
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

beforeAll(async () => {
    context = await createTestContext();
});
afterAll(() => context?.close());
beforeEach(async () => {
    await resetDatabase(context.container);
    carlos = await registerAndLogin(context.app, 'carlos@test.com');
    alberto = await registerAndLogin(context.app, 'alberto@test.com');
});

const create = (headers: Auth, payload: object = valid) =>
    context.app.inject({ method: 'POST', url: '/notifications', headers, payload });

describe('POST /notifications', () => {
    it('creates a pending notification and does not leak internal fields', async () => {
        const res = await create(carlos.headers);
        expect(res.statusCode).toBe(201);
        expect(res.json()).toMatchObject({ ...valid, status: 'pending', attempts: 0 });
        expect(res.json()).not.toHaveProperty('userId');
        expect(res.json()).not.toHaveProperty('lockedAt');
        
        const row = await context.container.prisma.notification.findFirstOrThrow();
        expect(row.userId).toBe(carlos.userId);
    });

    it('responds 400 for an unsupported channel, listing supported ones', async () => {
        const res =await create(carlos.headers, { ...valid, channel: 'fax' });
        expect(res.statusCode).toBe(400);
        expect(res.json().message).toMatch(/email, sms, push/);
        expect(await context.container.prisma.notification.count()).toBe(0);
    });

    it('responds 400 for missing or empty fields', async () => {
        expect(( await create(carlos.headers, { title: 'x' })).statusCode).toBe(400);
        expect(( await create(carlos.headers, { ...valid, title: '' })).statusCode).toBe(400);
        expect(await context.container.prisma.notification.count()).toBe(0);
    });

    it('ignores a client-supplied userId: ownership comes only from the token', async () => {
        const res = await create(carlos.headers, { ...valid, userId: alberto.userId });
        expect(res.statusCode).toBe(201);
        const row = await context.container.prisma.notification.findFirstOrThrow();
        expect(row.userId).toBe(carlos.userId);
    });

    it('responds 401 without a token', async() => {
        const res = await context.app.inject({ method: 'POST', url: '/notifications', payload: valid });
        expect(res.statusCode).toBe(401);
    });
});

describe('GET /notifications', () => {
    it('lists only my notifications, newest first', async () => {
        await create(carlos.headers, { ...valid, title: 'first' });
        await create(carlos.headers, { ...valid, title: 'second' });
        await create(alberto.headers, { ...valid, title: 'albertos' });
        const res = await context.app.inject({ method: 'GET', url: '/notifications', headers: carlos.headers });
        expect(res.statusCode).toBe(200);
        expect(res.json().map((notification: { title: string }) => notification.title )).toEqual(['second', 'first']);
    });
});

describe('PATCH /notifications/:id', () => {
    const patch = (id: string, headers: Auth, payload: object) =>
        context.app.inject({ method: 'PATCH', url: `/notifications/${id}`, headers, payload });

    it('updates a pending notification', async () => {
        const { id } = (await create(carlos.headers)).json();
        const res = await patch(id, carlos.headers, { title: 'Changed', channel: 'sms' });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ id, title: 'Changed', channel: 'sms', status: 'pending' });
    });

    it('re-queues a failed notification', async () => {
        const { id } = (await create(carlos.headers)).json();
        await context.container.prisma.notification.update({
            where: { id },
            data: { status: 'failed', attempts: 5 }
        });
        const res = await patch(id, carlos.headers, { content: 'fixed' });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ status: 'pending', attempts: 0 });
    });

    it.each(['sent', 'processing'] as const)(
        'responds 409 for a %s notification and leaves it unchanged',
        async (status) => {
            const { id } = (await create(carlos.headers)).json();
            await context.container.prisma.notification.update({ where: { id }, data: { status } });
            const res = await patch(id, carlos.headers, { title: 'Changed' });
            expect(res.statusCode).toBe(409);
            const row = await context.container.prisma.notification.findUniqueOrThrow({ where: { id } });
            expect(row).toMatchObject({ title: 'Hello', status });
        }
    );

    it("responds 404 for another user's or an unknown notification", async () => {
        const { id } = (await create(carlos.headers)).json();
        expect((await patch(id, alberto.headers, { title: 'hijack' })).statusCode).toBe(404);
        expect((await patch(UNKNOWN_ID, carlos.headers, { title: 'x' })).statusCode).toBe(404);
        
        const row = await context.container.prisma.notification.findUniqueOrThrow({ where: { id } });
        expect(row.title).toBe('Hello');
    });

    it('responds 400 for an empty body, invalid channel or invalid id', async () => {
        const { id } = (await create(carlos.headers)).json();
        expect(( await patch(id, carlos.headers, {})).statusCode).toBe(400);
        expect(( await patch(id, carlos.headers, { channel: 'fax' })).statusCode).toBe(400);
        expect(( await patch('not-a-uuid', carlos.headers, { title: 'x' })).statusCode).toBe(400);
    });
});

describe('DELETE /notifications/:id', () => {
    const del = (id: string, headers: Auth) => 
        context.app.inject({ method: 'DELETE', url: `/notifications/${id}`, headers });

    it('deletes my notification in any status', async () => {
        const { id } = (await create(carlos.headers)).json();
        await context.container.prisma.notification.update({ where: { id }, data: { status: 'sent' } });
        expect(( await del(id, carlos.headers)).statusCode).toBe(204);
        
        const list = await context.app.inject({ method: 'GET', url: '/notifications', headers: carlos.headers });
        expect(list.json()).toEqual([]);
    });

    it("responds 404 and keeps another user's notification", async () => {
        const { id } = (( await create(carlos.headers))).json();
        expect(( await del(id, alberto.headers)).statusCode).toBe(404);
        expect(( await del(UNKNOWN_ID, carlos.headers)).statusCode).toBe(404);
        expect(await context.container.prisma.notification.count()).toBe(1);
    });
});