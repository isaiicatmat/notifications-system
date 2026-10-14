export function onShutdown(handler: (signal: string) => Promise<void>): void {
    let shuttingDown = false;
    const run = async (signal: string): Promise<void> => {
        if (shuttingDown) return;
        shuttingDown = true;

        try {
            await handler(signal);
            process.exit(0);
        } catch(error) {
            console.error(error);
            process.exit(1);
        }
    };
    process.on('SIGINT', () => void run ('SIGINT'));
    process.on('SIGTERM', () => void run ('SIGTERM'));
}