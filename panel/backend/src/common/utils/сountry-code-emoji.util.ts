const CC_REGEX = /^[a-z]{2}$/i;
const FLAG_LENGTH = 4;
const OFFSET = 127397;

export function countryCodeEmoji(cc: string): string {
    if (!CC_REGEX.test(cc)) {
        const type = typeof cc;
        throw new TypeError(
            `cc argument must be an ISO 3166-1 alpha-2 string, but got '${
                type === 'string' ? cc : type
            }' instead.`,
        );
    }

    const codePoints = [...cc.toUpperCase()].map((c) => (c.codePointAt(0) as number) + OFFSET);
    return String.fromCodePoint(...codePoints);
}

export function emojiCountryCode(flag: string): string {
    if (flag.length !== FLAG_LENGTH) {
        const type = typeof flag;
        throw new TypeError(
            `flag argument must be a flag emoji, but got '${
                type === 'string' ? flag : type
            }' instead.`,
        );
    }

    const codePoints = [...flag].map((c) => (c.codePointAt(0) as number) - OFFSET);
    return String.fromCodePoint(...codePoints);
}
