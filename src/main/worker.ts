import 'dotenv/config';
import { loadConfig } from '../shared/config';
import { createContainer } from './container';
import { onShutdown } from './shutdown';

async function main(): Promise<void> {
    const config = loadConfig();
    const container = createContainer(config);
    const logger = {
        info: (message: string) => console.log(`[worker] ${message}`),
        error: (error: unknown, message: string) => console.error(`[wprker] ${message}`, error)
    };
    const worker = container.createWorker(logger);

    onShutdown(async (signal) => {
        logger.info(`${signal} received, finishing current batch`);
        await worker.stop();
        await container.close();
    });

    worker.start();
    logger.info(`started (poll ${config.worker.pollIntervalMs}ms, 
        batch ${config.worker.batchSize}, max attempts ${config.worker.maxAttempts})`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
})