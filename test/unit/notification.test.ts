import { describe, expect, it } from "vitest";
import { NOTIFICATION_STATUSES, canTransition, isEditable } from "../../src/domain/notification";

describe('notification status transitions', () => {
    it.each([
        ['pending', 'processing'],
        ['processing', 'sent'],
        ['processing', 'failed'],
        ['processing', 'pending'],
        ['failed', 'pending'],
    ] as const)('allow %s -> %s', (from, to) => {
        expect(canTransition(from, to)).toBe(true)
    });

    it.each([
        ['pending', 'sent'],
        ['pending', 'failed'],
        ['sent', 'pending'],
        ['sent', 'failed'],
        ['failed', 'sent'],
        ['failed', 'processing']
    ]as const)('rejects %s -> %s', (from, to) => {
        expect(canTransition(from, to)).toBe(false);
    });

    it('treats sent as last phase', () => {
        for (const to of NOTIFICATION_STATUSES) expect(canTransition('sent', to)).toBe(false);
    });

    it('allows edits only for pending and failed', () => {
        expect(isEditable('pending')).toBe(true);
        expect(isEditable('failed')).toBe(true);
        expect(isEditable('processing')).toBe(false);
        expect(isEditable('sent')).toBe(false);
    });
});