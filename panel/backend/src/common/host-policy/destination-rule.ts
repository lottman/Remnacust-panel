// Keep the frontend and node copies identical; destination-rules.test.cjs checks parity.
export function normalizeDestinationRule(input: string): string {
    const invalid = () => new Error('Enter a domain, IP address, CIDR or HTTP(S) URL');
    let value = input.trim().toLowerCase();
    // oxlint-disable-next-line no-control-regex -- Control characters are invalid in destinations.
    if (!value || /[\s\x00-\x1f\x7f\\]/u.test(value)) throw invalid();
    if (/^https?:\/\//.test(value)) {
        const url = new URL(value);
        if (url.username || url.password) throw invalid();
        value = url.hostname;
    }
    value = value.replace(/^domain:/, '').replace(/^\*\./, '').replace(/\.$/, '');
    const parts = value.split('/');
    if (parts.length > 2 || (parts.length === 2 && !/^(0|[1-9]\d*)$/.test(parts[1])))
        throw invalid();
    let address = parts[0];
    if (address.startsWith('[') && address.endsWith(']')) address = address.slice(1, -1);
    let bits = 0;
    let canonical: string;
    if (address.includes(':')) {
        if (!/^[a-f0-9:.]+$/.test(address)) throw invalid();
        canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
        bits = 128;
    } else if (/^[0-9.]+$/.test(address)) {
        const octets = address.split('.');
        if (octets.length !== 4 || octets.some((n) => !/^(0|[1-9]\d{0,2})$/.test(n) || +n > 255))
            throw invalid();
        canonical = address;
        bits = 32;
    } else {
        if (['/', '@', ':', '?', '#', '%', '[', ']'].some((char) => address.includes(char))) throw invalid();
        canonical = new URL(`http://${address}/`).hostname;
        if (/^[0-9.]+$/.test(canonical) || canonical.length > 253 ||
            !/^[a-z0-9.-]+$/.test(canonical) || canonical.split('.').some(
                (label) => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'),
            )) throw invalid();
    }
    if (parts.length === 1) return canonical;
    const prefix = Number(parts[1]);
    if (!bits || prefix > bits) throw invalid();
    // Canonical networks make overlapping presets and manually entered CIDRs deduplicate.
    let words: string[];
    if (bits === 32) words = canonical.split('.').map((n) => (+n).toString(16).padStart(2, '0'));
    else {
        const [left, right] = canonical.split('::');
        const a = left ? left.split(':') : [];
        const b = right ? right.split(':') : [];
        words = [...a, ...Array(8 - a.length - b.length).fill('0'), ...b].map((n) => n.padStart(4, '0'));
    }
    const shift = BigInt(bits - prefix);
    const network = (BigInt('0x' + words.join('')) >> shift) << shift;
    const hex = network.toString(16).padStart(bits / 4, '0');
    const normalized = bits === 32
        ? hex.match(/../g)!.map((n) => parseInt(n, 16)).join('.')
        : new URL(`http://[${hex.match(/.{4}/g)!.join(':')}]/`).hostname.slice(1, -1);
    return `${normalized}/${prefix}`;
}

export function isIpDestinationRule(rule: string): boolean {
    return rule.includes(':') || rule.includes('/') || /^[0-9.]+$/.test(rule);
}
