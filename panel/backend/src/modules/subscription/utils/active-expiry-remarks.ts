import {
    ActiveExpiryItem,
    ActiveExpirySchema,
    parseActiveExpiryRemark,
    TCustomRemarks,
} from '@libs/contracts/models/subscription-settings/custom-remarks.schema';

export type { ActiveExpiryItem } from '@libs/contracts/models/subscription-settings/custom-remarks.schema';

export interface ActiveExpiryPlan {
    ruleId: string;
    selectedAt: number;
    rows: ActiveExpiryItem[];
    items?: ActiveExpiryItem[];
    presentationBytes?: number;
    omitGlobalAction?: boolean;
}

export async function selectActiveExpiryPlan(
    user: { status: string; expireAt: Date; externalSquadUuid?: string | null },
    settings: { isShowCustomRemarks: boolean; customRemarks: TCustomRemarks },
    internalSquads: () => Promise<string[]>,
    now = Date.now(),
): Promise<ActiveExpiryPlan | null> {
    if (!settings.isShowCustomRemarks || user.status !== 'ACTIVE') return null;
    const remaining = user.expireAt.getTime() - now;
    if (!(remaining > 0)) return null;
    if (!settings.customRemarks.activeExpiry) return null;
    const parsed = ActiveExpirySchema.safeParse(settings.customRemarks.activeExpiry);
    if (!parsed.success) return null;
    const candidates = parsed.data.rules
        .filter((rule) => rule.enabled && remaining <= rule.daysBeforeExpiry * 86400000)
        .sort((a, b) => a.daysBeforeExpiry - b.daysBeforeExpiry);
    let membership: Set<string> | undefined;
    for (const rule of candidates) {
        let matches =
            rule.scope === 'all' ||
            (user.externalSquadUuid !== null &&
                user.externalSquadUuid !== undefined &&
                rule.externalSquadUuids.includes(user.externalSquadUuid.toLowerCase()));
        if (!matches && rule.internalSquadUuids.length) {
            membership ??= new Set((await internalSquads()).map((id) => id.toLowerCase()));
            matches = rule.internalSquadUuids.some((id) => membership!.has(id));
        }
        if (matches)
            return {
                ruleId: rule.id,
                selectedAt: now,
                rows: rule.remarks.map((row) => parseActiveExpiryRemark(row)!),
            };
    }
    return null;
}

export const MAX_SUBSCRIPTION_HEADER_BYTES = 14 * 1024;

type SubscriptionHeaders = Record<string, string | undefined>;
const presentationHeader = 'x-era-subscription-presentation';
const actionHeader = 'x-era-subscription-action';

export function serializedHeaderBytes(headers: SubscriptionHeaders): number {
    const normalized = new Map(
        Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
    );
    return [...normalized].reduce(
        (total, [key, value]) =>
            value === undefined ? total : total + Buffer.byteLength(`${key}: ${value}\r\n`),
        0,
    );
}

function removeHeader(headers: SubscriptionHeaders, name: string) {
    for (const key of Object.keys(headers)) if (key.toLowerCase() === name) delete headers[key];
}

export function omitSubscriptionAction(headers: SubscriptionHeaders) {
    removeHeader(headers, actionHeader);
}

export function presentationBudget(
    headers: SubscriptionHeaders,
    hasHosts: boolean,
    reserved = 0,
    hasNotices = true,
) {
    const base = { ...headers };
    removeHeader(base, presentationHeader);
    const overhead = Buffer.byteLength(`${presentationHeader}: \r\n`) + reserved;
    const required: ActiveExpiryItem[] = [];
    if (hasHosts) required.push({ kind: 'hosts' });
    if (hasNotices) required.push({ kind: 'text', text: '…' });
    const minimum = required.length
        ? Buffer.from(JSON.stringify(required)).toString('base64').length
        : 0;
    let omitGlobalAction = false;
    if (serializedHeaderBytes(base) + overhead + minimum > MAX_SUBSCRIPTION_HEADER_BYTES) {
        removeHeader(base, actionHeader);
        omitGlobalAction = true;
    }
    const bytes = MAX_SUBSCRIPTION_HEADER_BYTES - serializedHeaderBytes(base) - overhead;
    if (bytes < minimum) throw new Error('Subscription headers exceed the response budget');
    return { presentationBytes: Math.max(0, bytes), omitGlobalAction };
}

export function boundSubscriptionHeaders(
    headers: SubscriptionHeaders,
    extra: SubscriptionHeaders = {},
) {
    if (serializedHeaderBytes({ ...headers, ...extra }) <= MAX_SUBSCRIPTION_HEADER_BYTES) return;
    removeHeader(headers, actionHeader);
    if (serializedHeaderBytes({ ...headers, ...extra }) > MAX_SUBSCRIPTION_HEADER_BYTES)
        throw new Error('Subscription headers exceed the response budget');
}

export function boundPresentationItems<T extends { kind: string }>(
    items: T[],
    encodedBytes = Infinity,
): T[] {
    const bounded = [...items];
    while (
        bounded.length &&
        (Buffer.byteLength(JSON.stringify(bounded)) > 4500 ||
            Buffer.from(JSON.stringify(bounded)).toString('base64').length > encodedBytes)
    ) {
        const index = bounded.findLastIndex((item) => item.kind !== 'hosts');
        if (index < 0) break;
        bounded.splice(index, 1);
    }
    return bounded;
}

export function boundActivePresentationItems(
    items: ActiveExpiryItem[],
    encodedBytes = Infinity,
): ActiveExpiryItem[] {
    const bounded = boundPresentationItems(items, encodedBytes);
    const noticeIndex = items.findIndex((item) => item.kind !== 'hosts');
    if (noticeIndex < 0 || bounded.some((item) => item.kind !== 'hosts')) return bounded;
    const first = items[noticeIndex];
    if (first.kind === 'hosts') return bounded;
    const markerIndex = items.findIndex((item) => item.kind === 'hosts');
    const marker = bounded.find((item) => item.kind === 'hosts');
    const combine = (notice: ActiveExpiryItem) =>
        marker ? (markerIndex < noticeIndex ? [marker, notice] : [notice, marker]) : [notice];
    const text =
        first.kind === 'text'
            ? first.text
            : [first.text, first.buttonText].filter(Boolean).join(' · ');
    const points = Array.from(text.trim() || '…');
    let low = 0,
        high = points.length;
    let notice: ActiveExpiryItem | undefined;
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const candidate = {
            kind: 'text' as const,
            text: points.slice(0, middle).join('') + (middle < points.length ? '…' : ''),
        };
        const combined = combine(candidate);
        if (
            Buffer.byteLength(JSON.stringify(combined)) <= 4500 &&
            Buffer.from(JSON.stringify(combined)).toString('base64').length <= encodedBytes
        ) {
            notice = candidate;
            low = middle + 1;
        } else high = middle - 1;
    }
    if (!notice) throw new Error('Subscription headers cannot fit the active notice');
    return combine(notice);
}
