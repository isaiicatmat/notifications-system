import 'dotenv/config';
import { buildApp } from '../presentation/http/app';
import { loadConfig } from '../shared/config';
import { createContainer } from './container';
import { onShutdown } from './shutdown';

async function main(): Promise<void> {
    const config = loadConfig();
    const container = createContainer(config, { logger: true });
    const app = await buildApp(container.app);

    const worker = config.worker.inProcess ? container.createWorker({ 
        info: (message) => app.log.info(message), 
        error: (error, message) => app.log.error(error, message)
    }) : undefined;

    onShutdown(async (signal) => {
        app.log.info(`${signal} received, shutting down`);
        await app.close();
        await worker?.stop();
        await container.close();
    });

    await app.listen({ port: config.port, host: config.host });

    if (worker) {
        worker.start();
        app.log.info('Delivery worker started in-process');
    }

    if (config.swaggerEnabled) {
        app.log.info(`Swagger UI available at http://localhost:${config.port}/docs`);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
})

