import { countryCodeEmoji } from './сountry-code-emoji.util';

const UNKNOWN_FLAG = '🏴‍☠️';

export function resolveCountryEmoji(countryCode: string): string {
    if (countryCode === 'XX') {
        return UNKNOWN_FLAG;
    }

    try {
        return countryCodeEmoji(countryCode);
    } catch {
        return UNKNOWN_FLAG;
    }
}
