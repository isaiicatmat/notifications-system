const MAX_DELAY_MS = 60 * 60 * 1000;

/** Exponential backoff: base * 2^(attempt - 1), capped at one hour. `attempt` starts at 1. */
export function backoffDelayMs(attempt: number, baseMs: number): number {
    return Math.min(baseMs * 2 ** Math.max(0, attempt - 1), MAX_DELAY_MS);
}