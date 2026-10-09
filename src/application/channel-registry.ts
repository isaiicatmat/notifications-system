import type { Channel } from "../domain/channel";

export class ChannelRegistry {
    private readonly channels = new Map<string, Channel>();

    register(channel: Channel): this {
        if (this.channels.has(channel.name)) {
            throw new Error(`Channel already registered: ${channel.name}`);
        }

        this.channels.set(channel.name, channel);
        return this;
    }

    has(name: string): boolean {
        return this.channels.has(name);
    }

    get(name: string): Channel | undefined {
        return this.channels.get(name);
    }

    names(): string[] {
        return [...this.channels.keys()];
    }
}