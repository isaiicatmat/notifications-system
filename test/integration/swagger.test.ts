import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './helper';

type Operation = {
    security?: unknown[];
    responses: Record<string, unknown>;
    tags?: string[];
    summary?: string;
};

type OpenApi = {
    openapi: string;
    paths: Record<string, Record<string, Operation>>;
    components: { securitySchemes: Record<string, unknown>; schemas: Record<string, unknown> };
};

type Method = 'get' | 'post' | 'patch' | 'delete';

let context: TestContext;
let doc: OpenApi;

function getOperation(method: Method, path: string): Operation {
    const operation = doc.paths[path]?.[method];
    if (!operation) throw new Error(`${method.toUpperCase()} ${path} is not documented`);
    return operation;
}

function responseCodes(method: Method, path: string): string[] {
    return Object.keys(getOperation(method, path).responses);
}

beforeAll(async () => {
    context = await createTestContext();
    const res = await context.app.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
    doc = res.json();
});

afterAll(() => context?.close());

const PUBLIC = [
    ['post', '/auth/register'],
    ['post', '/auth/login'],
    ['get', '/health'],
] as const;
const PROTECTED = [
    ['post', '/notifications'],
    ['get', '/notifications'],
    ['patch', '/notifications/{id}'],
    ['delete', '/notifications/{id}'],
    ['get', '/notifications/{id}/deliveries'],
] as const;

describe('OpenAPI document', () => {
    it('is a valid OpenAPI 3 document with bearer authentication declared', () => {
        expect(doc.openapi).toMatch(/^3\./);
        expect(doc.components.securitySchemes.bearerAuth).toEqual({
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
        });
    });

    it('lists every endpoint with a tag and summary', () => {
        for (const [method, path] of [...PUBLIC, ...PROTECTED]) {
            const operation = getOperation(method, path);
            expect(operation?.tags?.length).toBeGreaterThan(0);
            expect(operation?.summary).toBeTruthy();
        }
    });

    it('marks only protected endpoints as requiring bearerAuth', () => {
        for (const [method, path] of PUBLIC) {
            expect(getOperation(method, path).security, path).toBeUndefined();
        }

        for (const [method, path] of PROTECTED) {
            expect(getOperation(method, path).security, path).toEqual([{ bearerAuth: [] }]);
            expect(responseCodes(method, path), path).toContain('401');
        }
    });

    it('documents error responses', () => {
        expect(responseCodes('post', '/auth/register')).toEqual(
            expect.arrayContaining(['201', '400', '409']),
        );

        expect(responseCodes('patch', '/notifications/{id}')).toEqual(
            expect.arrayContaining(['200', '400', '401', '404', '409']),
        );
    });

    it('serves the Swagger UI without authentication', async () => {
        const res = await context.app.inject({ method: 'GET', url: '/docs' });
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toMatch(/html/);
    });
});

describe('SWAGGER_ENABLE=false', () => {
    it('does not expose the documentation', async () => {
        const disabled = await createTestContext({ env: { SWAGGER_ENABLED: 'false' } });
        try {
            expect(
                (await disabled.app.inject({ method: 'GET', url: '/docs/json' })).statusCode,
            ).toBe(404);
            expect((await disabled.app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(
                200,
            );
        } finally {
            await disabled.close();
        }
    });
});
