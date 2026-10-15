import { describe, expect, it } from 'vitest';
import { backoffDelayMs } from '../../src/application/backoff';

describe('backoffDelayMs', () => {
    it('doubles with every attempt', () => {
        expect([1, 2, 3, 4].map((attemtp) => backoffDelayMs(attemtp, 1000))).toEqual([
            1000, 2000, 4000, 8000,
        ]);
    });

    it('is capped at one hour', () => {
        expect(backoffDelayMs(30, 1000)).toBe(3_600_000);
    });
});
