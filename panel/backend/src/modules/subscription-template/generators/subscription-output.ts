import { ClientPoolError } from './client-pool';

export const MAX_SUBSCRIPTION_BYTES = 16 * 1024 * 1024;

export function assertSubscriptionSize(bytes: number): void {
    if (bytes > MAX_SUBSCRIPTION_BYTES) throw new ClientPoolError('subscription-size-limit');
}

export function boundedSubscriptionOutput(output: string): string {
    assertSubscriptionSize(Buffer.byteLength(output));
    return output;
}

export class SubscriptionExpansionBudget {
    private bytes = 0;
    private readonly costs = new Map<string, number>();

    constructor(private readonly format: 'json' | 'yaml') {}

    public appendMember(value: string): void {
        if (typeof value !== 'string') throw new ClientPoolError('Invalid client group member');
        let cost = this.costs.get(value);
        if (cost === undefined) {
            assertSubscriptionSize(Buffer.byteLength(value));
            cost = 2;
            for (let index = 0; index < value.length; index++) {
                const code = value.charCodeAt(index);
                if (code < 32) {
                    const shortEscape =
                        code === 8 || code === 9 || code === 10 || code === 12 || code === 13;
                    cost += this.format === 'yaml' ? 10 : shortEscape ? 2 : 6;
                } else if (code === 34 || code === 92 || (this.format === 'yaml' && code === 39)) {
                    cost += 2;
                } else if (code < 127) {
                    cost++;
                } else if (
                    code >= 0xd800 &&
                    code <= 0xdbff &&
                    value.charCodeAt(index + 1) >= 0xdc00 &&
                    value.charCodeAt(index + 1) <= 0xdfff
                ) {
                    index++;
                    cost += this.format === 'yaml' ? 10 : 4;
                } else if ((code >= 0xd800 && code <= 0xdfff) || this.format === 'yaml') {
                    cost += 6;
                } else {
                    cost += code < 0x800 ? 2 : 3;
                }
                assertSubscriptionSize(cost);
            }
            cost += this.format === 'yaml' ? 10 + Math.ceil(cost / 64) * 8 : 1;
            assertSubscriptionSize(cost);
            this.costs.set(value, cost);
        }
        assertSubscriptionSize(this.bytes + cost);
        this.bytes += cost;
    }
}
