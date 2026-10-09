import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client';

export type { PrismaClient};

export function createPrismaClient(databaseUrl: string): PrismaClient {
    const url = new URL(databaseUrl);
    const schema = url.searchParams.get('schema') ?? undefined;
    url.searchParams.delete('schema');
    const adapter = new PrismaPg({ connectionString: url.toString() }, schema ? { schema } : undefined);
    return new PrismaClient({ adapter });
}
