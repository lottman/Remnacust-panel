import { ResolvedProxyConfigSchema } from '@libs/contracts/models';
import {
    ActiveExpirySchema,
    SubscriptionActionSchema,
    TCustomRemarks,
} from '@libs/contracts/models/subscription-settings/custom-remarks.schema';

export function validateCustomRemarks(remarks: TCustomRemarks): string | null {
    if (Object.hasOwn(remarks, 'activeExpiry')) {
        const active = ActiveExpirySchema.safeParse(remarks.activeExpiry);
        if (!active.success) return `activeExpiry: ${active.error.message}`;
    }
    for (const [status, rows] of Object.entries(remarks)) {
        if (!Array.isArray(rows)) continue;
        for (const row of rows) {
            if (typeof row !== 'string') return `${status}: Expected text`;
            if (row.trim() === '{{FREE_HOST}}' || !row.trim().startsWith('{')) continue;
            try {
                const parsed = JSON.parse(row);
                if (parsed.type === 'link') SubscriptionActionSchema.parse(parsed);
                else ResolvedProxyConfigSchema.parse(parsed);
            } catch (error) {
                return `${status}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            }
        }
    }
    return null;
}
