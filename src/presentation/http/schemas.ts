// Needed to TS does not reject properties in routes
import type {} from '@fastify/swagger';
import { Type } from '@sinclair/typebox';

const ERROR_RESPONSE_ID = 'ErrorResponse';

export const ErrorResponse = Type.Object(
    {
        error: Type.String({ exmaples: ['VALIDATION_ERROR'] }),
        message: Type.String()
    },
    { $id: 'ErrorResponse' },
);

export const errorResponses = {
    400: Type.Ref(ERROR_RESPONSE_ID, { description: 'Validation error '}),
    401: Type.Ref(ERROR_RESPONSE_ID, { description: 'Missing, invalid or expired token' }),
    404: Type.Ref(ERROR_RESPONSE_ID, { description: 'Resource not found' }),
    409: Type.Ref(ERROR_RESPONSE_ID, { description: 'Conflict' })
} as const;