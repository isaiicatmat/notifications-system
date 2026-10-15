import 'dotenv/config';
import pino from 'pino';
import type { WorkerLogger } from '../infrastructure/worker/delivery-worker';
import { loadConfig } from '../shared/config';
import { createContainer } from './container';
import { onShutdown } from './shutdown';

const log = pino({ name: 'worker' });

async function main(): Promise<void> {
    const config = loadConfig();
    const container = createContainer(config);
    const logger: WorkerLogger = {
        info: (message) => log.info(message),
        error: (error, message) => log.error({ err: error }, message),
    };
    const worker = container.createWorker(logger);

    onShutdown(async (signal) => {
        logger.info(`${signal} received, finishing current batch`);
        await worker.stop();
        await container.close();
    });

    worker.start();
    log.info(
        {
            pollIntervalMs: config.worker.pollIntervalMs,
            batchSize: config.worker.batchSize,
            maxAttempts: config.worker.maxAttempts,
        },
        'worker started',
    );
}

main().catch((error) => {
    log.fatal({ err: error }, 'worker failed to start');
    process.exit(1);
});
