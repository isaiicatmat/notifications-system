import { describe, expect, it } from 'vitest';
import type { DeliveryService } from '../../src/application/delivery-service';
import { DeliveryWorker, type WorkerLogger } from '../../src/infrastructure/worker/delivery-worker';

type RunOnce = DeliveryService['runOnce'];

const fakeService = (runOnce: RunOnce) => ({ runOnce }) as unknown as DeliveryService;

const silentLogger = (): WorkerLogger & { errors: string[] } => {
    const errors: string[] = [];
    return { errors, info: () => undefined, error: (_error, message) => errors.push(message) };
};

const waitFor = async (condition: () => boolean, timeoutMs = 1000) => {
    const start = Date.now();
    while (!condition()) {
        if (Date.now() - start > timeoutMs) throw new Error('condition not met in time');
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
};

const createGate = () => {
    let open: () => void = () => undefined;
    const wait = new Promise<void>((resolve) => (open = resolve));
    return { wait, open };
};

describe('DeliveryWorker', () => {
    it('logs each failed delivery with its notification id', async () => {
        const logger = silentLogger();
        const service = fakeService(async (onError) => {
            onError?.(new Error('provider down'), 'n-1');
            return 0;
        });
        const worker = new DeliveryWorker(service, 5, 10, logger);

        worker.start();
        await waitFor(() => logger.errors.length > 0);
        await worker.stop();

        expect(logger.errors[0]).toBe('Delivery of notification n-1 failed');
    });

    it('logs a failed iteration and keeps polling', async () => {
        const logger = silentLogger();
        let calls = 0;
        const service = fakeService(async () => {
            calls++;
            if (calls === 1) throw new Error('db unavailable');
            return 0;
        });
        const worker = new DeliveryWorker(service, 5, 10, logger);

        worker.start();
        await waitFor(() => calls >= 2);
        await worker.stop();

        expect(logger.errors).toContain('Delivery iteration failed');
    });

    it('does not start a second loop while stop() is draining, and can restart after', async () => {
        const gate = createGate();
        let calls = 0;
        let active = 0;
        let maxActive = 0;
        const service = fakeService(async () => {
            calls++;
            active++;
            maxActive = Math.max(maxActive, active);
            if (calls === 1) await gate.wait;
            active--;
            return 0;
        });
        const worker = new DeliveryWorker(service, 5, 10, silentLogger());

        worker.start();
        worker.start(); // already running: no-op
        await waitFor(() => calls === 1);

        const stopping = worker.stop();
        worker.start(); // previous loop still draining: must be ignored
        gate.open();
        await stopping;

        expect(calls).toBe(1);
        expect(maxActive).toBe(1);

        // Once stopped, the worker can be started again.
        worker.start();
        await waitFor(() => calls >= 2);
        await worker.stop();
        expect(maxActive).toBe(1);
    });
});
