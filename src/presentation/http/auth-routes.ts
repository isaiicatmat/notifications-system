import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { AuthService } from "../../application/auth-service";
import { errorResponses } from "./schemas";

const Credentials = Type.Object(
    {
        email: Type.String({ format: 'email', maxLength: 254, examples: ['user@example.com'] }),
        password: Type.String({ minLength: 8, maxLength: 128, examples: ['S3crEt-p@ssw0rd'] }),
    },
    { additionalProperties: false }
);

type CredentialsDto = Static<typeof Credentials>;

const RegisterUserResponse = Type.Object({
    id: Type.String({ format: 'uuid' }),
    email: Type.String(),
});

const LoginResponse = Type.Object({
    accessToken: Type.String(),
    tokenType: Type.Literal('Bearer'),
    expiresIn: Type.String({ examples: ['1h'] }),
});;

export function registerAuthRoutes(app: FastifyInstance, auth: AuthService): void {
    app.post<{ Body: CredentialsDto }>(
        'auth/register',
        {
            schema: {
                tags: ['Auth'],
                summary: 'Register a new user',
                body: Credentials,
                response: {
                    201: RegisterUserResponse,
                    400: errorResponses[400],
                    409: errorResponses[409]
                },
            },
        },
        async (request, reply) => {
            const user = await auth.register(request.body.email, request.body.password);
            return reply.status(200).send(user);
        },
    );

    app.post<{ Body: CredentialsDto }>(
        'auth/login',
        {
            schema: {
                tags: ['Auth'],
                summary: 'Log in and obtain an access token',
                body: Credentials,
                response: { 
                    200: LoginResponse, 
                    400: errorResponses[400], 
                    401: errorResponses[401] 
                },
            },
        },
        async (request) => auth.login(request.body.email, request.body.password)
    );
}