export class HashedSet extends Set<string> {
    private _hashHigh: number = 0;
    private _hashLow: number = 0;

    constructor(iterable?: Iterable<string>) {
        super(iterable);
        for (const str of this) {
            const hash64 = this._djb2Dual(str);
            this._hashHigh ^= hash64.high;
            this._hashLow ^= hash64.low;
        }
    }

    private _djb2Dual(str: string): { high: number; low: number } {
        let high = 5381;
        let low = 5387;

        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);

            high = ((high << 5) + high + char) | 0;
            low = ((low << 6) + low + char * 37) | 0;
        }

        return {
            high: high >>> 0,
            low: low >>> 0,
        };
    }

    add(str: string): this {
        if (!this.has(str)) {
            const hash64 = this._djb2Dual(str);
            this._hashHigh ^= hash64.high;
            this._hashLow ^= hash64.low;
        }
        return super.add(str);
    }

    delete(str: string): boolean {
        if (this.has(str)) {
            const hash64 = this._djb2Dual(str);
            this._hashHigh ^= hash64.high;
            this._hashLow ^= hash64.low;
        }
        return super.delete(str);
    }

    clear(): void {
        super.clear();
        this._hashHigh = 0;
        this._hashLow = 0;
    }

    get hashHigh(): number {
        return this._hashHigh;
    }
    get hashLow(): number {
        return this._hashLow;
    }

    hasSameHash(other: HashedSet): boolean {
        return this.hashHigh === other.hashHigh && this.hashLow === other.hashLow;
    }

    get hash64String(): string {
        return (
            this.hashHigh.toString(16).padStart(8, '0') + this.hashLow.toString(16).padStart(8, '0')
        );
    }

    fastEquals(other: HashedSet): boolean {
        return this.size === other.size && this.hasSameHash(other);
    }

    getHashStats(): {
        size: number;
        hashHigh: string;
        hashLow: string;
        hash64: string;
        entropy: number;
    } {
        let setBits = 0;
        for (let i = 0; i < 32; i++) {
            if (this._hashHigh & (1 << i)) setBits++;
            if (this._hashLow & (1 << i)) setBits++;
        }

        return {
            size: this.size,
            hashHigh: this._hashHigh.toString(16).padStart(8, '0'),
            hashLow: this._hashLow.toString(16).padStart(8, '0'),
            hash64: this.hash64String,
            entropy: setBits / 64,
        };
    }
}
