import { inflateSync } from 'node:zlib';

// SagerNet/sing-box v1.13.0 common/srs and sing e419e9875a07 common/domain/set.go.
// Parse lengths and all records without constructing a client matcher or executing expressions.
export function validateSrs(data: Buffer): void {
    const invalid = (): never => {
        throw new Error('geofile-srs');
    };
    if (data.length < 5 || data.subarray(0, 3).toString() !== 'SRS' || data[3] < 1 || data[3] > 4)
        invalid();
    // Node's info option returns this structure; @types/node declares only the default Buffer result.
    const inflated = inflateSync(data.subarray(4), {
        maxOutputLength: 64 * 1024 * 1024,
        info: true,
    }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
    if (inflated.engine.bytesWritten !== data.length - 4) invalid();
    const body = inflated.buffer;
    let offset = 0,
        rules = 0;
    const take = (length: number): Buffer => {
        if (!Number.isSafeInteger(length) || length < 0 || length > body.length - offset) invalid();
        const bytes = body.subarray(offset, offset + length);
        offset += length;
        return bytes;
    };
    const byte = () => take(1)[0];
    const variable = (): number => {
        let value = 0n;
        for (let i = 0; i < 10; i++) {
            const part = byte();
            if (i === 9 && part > 1) invalid();
            value |= BigInt(part & 127) << BigInt(i * 7);
            if (!(part & 128)) {
                if (value > BigInt(Number.MAX_SAFE_INTEGER)) invalid();
                return Number(value);
            }
        }
        return invalid();
    };
    const count = (minimumBytes: number) => {
        const length = variable();
        if (length > Math.floor((body.length - offset) / minimumBytes)) invalid();
        return length;
    };
    const boolean = () => {
        if (byte() > 1) invalid();
    };
    const address = () => {
        const length = variable();
        if (length !== 4 && length !== 16) invalid();
        return take(length);
    };
    const prefixes = () => {
        const length = count(6);
        for (let i = 0; i < length; i++) {
            const ip = address();
            if (byte() > ip.length * 8) invalid();
        }
    };
    const ipSet = () => {
        if (byte() !== 1) invalid();
        const ranges = take(8).readBigUInt64BE();
        if (ranges > BigInt(Math.floor((body.length - offset) / 10))) invalid();
        let previous: Buffer | undefined;
        for (let i = 0; i < Number(ranges); i++) {
            const from = address(),
                to = address();
            if (from.length !== to.length || Buffer.compare(from, to) > 0) invalid();
            if (
                previous &&
                (previous.length > from.length ||
                    (previous.length === from.length && Buffer.compare(previous, from) >= 0))
            )
                invalid();
            previous = to;
        }
    };
    const bit = (words: Buffer, index: number) =>
        (words[Math.floor(index / 64) * 8 + 7 - Math.floor((index % 64) / 8)] >>> (index % 8)) & 1;
    const padding = (words: Buffer, bits: number) => {
        for (let i = bits; i < words.length * 8; i++) if (bit(words, i)) invalid();
    };
    const matcher = () => {
        if (byte() !== 0) invalid();
        const leaves = take(count(8) * 8);
        const bitmap = take(count(8) * 8);
        const labels = take(variable());
        const nodes = labels.length + 1,
            bits = 2 * labels.length + 1;
        if (
            leaves.length !== Math.ceil(nodes / 64) * 8 ||
            bitmap.length !== Math.ceil(bits / 64) * 8
        )
            invalid();
        let pending = 1,
            visited = 0,
            edges = 0,
            lastLabel = -1;
        for (let i = 0; i < bits; i++) {
            if (pending === 0) invalid();
            if (bit(bitmap, i)) {
                pending--;
                visited++;
                lastLabel = -1;
            } else {
                if (edges >= labels.length || labels[edges] <= lastLabel) invalid();
                lastLabel = labels[edges++];
                pending++;
            }
        }
        if (
            pending !== 0 ||
            visited !== nodes ||
            edges !== labels.length ||
            !bit(leaves, nodes - 1)
        )
            invalid();
        padding(leaves, nodes);
        padding(bitmap, bits);
    };
    const stringList = () => {
        const length = count(1);
        const decoder = new TextDecoder('utf-8', { fatal: true });
        for (let i = 0; i < length; i++) decoder.decode(take(variable()));
    };
    const rule = (depth: number): void => {
        if (depth > 16 || ++rules > 100_000) invalid();
        const type = byte();
        if (type === 1) {
            if (byte() > 1) invalid();
            const length = count(3);
            for (let i = 0; i < length; i++) rule(depth + 1);
            boolean();
            return;
        }
        if (type !== 0) invalid();
        for (;;) {
            const item = byte();
            if (item === 255) {
                boolean();
                return;
            }
            switch (item) {
                case 0:
                case 7:
                case 9:
                    take(count(2) * 2);
                    break;
                case 1:
                case 3:
                case 4:
                case 8:
                case 10:
                case 11:
                case 12:
                case 13:
                case 14:
                case 15:
                case 17:
                    stringList();
                    break;
                case 2:
                case 16:
                    matcher();
                    break;
                case 5:
                case 6:
                    ipSet();
                    break;
                case 18:
                    take(count(1));
                    break;
                case 19:
                case 20:
                    break;
                case 21: {
                    const length = count(2);
                    for (let i = 0; i < length; i++) {
                        byte();
                        prefixes();
                    }
                    break;
                }
                case 22:
                    prefixes();
                    break;
                default:
                    invalid();
            }
        }
    };
    const length = count(3);
    if (!length || length > 100_000) invalid();
    for (let i = 0; i < length; i++) rule(0);
    if (offset !== body.length) invalid();
}
