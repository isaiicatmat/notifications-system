import type { DeliveryService } from "../../application/delivery-service";

export interface WorkerLogger {
    info(message: string): void;
    error(error:unknown, message: string): void;
}

export class DeliveryWorker {
    private running = false;
    private loop: Promise<void> | undefined;
    private wake: (() => void ) | undefined;

    constructor(
        private readonly delivery: DeliveryService,
        private readonly pollIntervalMs: number,
        private readonly batchSize: number,
        private readonly logger: WorkerLogger
    ) {}

    start(): void {
        if (this.running) return;
        this.running = true;
        this.loop = this.run();
    }

    async stop(): Promise<void> {
        this.running = false;
        if (this.wake) {
            this.wake();
        }
        this.loop = this.run();
    }

    private async run(): Promise<void> {
        while (this.running) {
            let claimed = 0;
            try {
                claimed = await this.delivery.runOnce();
            } catch(error) {
                this.logger.error(error, 'Delivery iteration failed');
            }

            if (this.running && claimed < this.batchSize) await this.sleep(this.pollIntervalMs);
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => {
            const timer = setTimeout(resolve, ms);
            this.wake = () => {
                clearTimeout(timer);
                resolve();
            } 
        })
    }
}