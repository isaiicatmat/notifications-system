import { ConflictError } from "../../domain/errors";
import type { UserRepository } from "../../domain/ports";
import type { User } from "../../domain/user";
import type { PrismaClient } from "./client";

function isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

export class PrismaUserRepository implements UserRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async create(data: { email: string; passwordHash: string }): Promise<User> {
        try {
            return await this.prisma.user.create({ data });
        } catch(error) {
            if (isUniqueViolation(error)) throw new ConflictError('Email is already registered');
            throw error;
        }
    }

    findByEmail(email: string): Promise<User | null> {
        return this.prisma.user.findUnique({ where: { email }});
    }
}