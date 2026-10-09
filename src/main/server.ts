import 'dotenv/config';
import { buildApp } from '../presentation/http/app';
import { loadConfig } from '../shared/config';
import { createContainer } from './container';

async function main(): Promise<void> {
    const config = loadConfig();
    const container = createContainer(config, { logger: true });
    const app = await buildApp(container.app);
    await app.listen({ port: config.port, host: config.host });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
})

