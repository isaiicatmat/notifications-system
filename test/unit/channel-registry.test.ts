import { describe, expect, it } from "vitest";
import { ChannelRegistry } from "../../src/application/channel-registry";
import type { Channel } from "../../src/domain/channel";

const fake = (name: string): Channel => ({
    name,
    send: async() => ({ outcome: 'sent', details: {} }),
});

describe('ChannelRegistry', () => {

    it('registers and looks up channels by name', () => {
        const email = fake('email');
        const registry = new ChannelRegistry().register(email).register(fake('sms'));
        expect(registry.get('email')).toBe(email);
        expect(registry.has('sms')).toBe(true);
        expect(registry.names()).toEqual(['email', 'sms']);
    });

    it('returns undefined for an unknown channel', () => {
        const registry = new ChannelRegistry();
        expect(registry.get('fax')).toBeUndefined();
        expect(registry.has('fax')).toBe(false);
    });

    it('rejects duplicate registration', () => {
        const registry = new ChannelRegistry().register(fake('email'));
        expect(() => registry.register(fake('email'))).toThrow(/already registered/);
    });

});