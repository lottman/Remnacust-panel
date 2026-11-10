import { ClientPoolError } from '../generators/client-pool';
import { geofileInlineRuleLimit } from './geofile-inline-limit';
import {
    compactIncySubscription,
    xrayProfilesFit,
    INCY_FORMATTED_CONFIG_BUDGET,
    XRAY_FORMATTED_CONFIG_BUDGET,
} from './incy-config';
import { XrayGeofileDelivery, XrayGeofileFallback } from './xray-geofile-delivery';

export async function automaticXrayDelivery(options: {
    client?: 'happ' | 'incy';
    inlineRuleLimit?: number;
    manualRouting: boolean;
    title: string;
    profileKey: string;
    generate: (delivery?: XrayGeofileDelivery) => Promise<string>;
}): Promise<{
    subscription: string;
    header?: string;
    intervalHours?: number;
    inline: boolean;
    sourceRevision?: string;
}> {
    const { client, manualRouting, title, profileKey, generate } = options;
    const limit = geofileInlineRuleLimit(options.inlineRuleLimit);
    const budget = client === 'incy' ? INCY_FORMATTED_CONFIG_BUDGET : XRAY_FORMATTED_CONFIG_BUDGET;
    const inline =
        client && !manualRouting
            ? new XrayGeofileDelivery(client, 'inline', title, limit, true)
            : undefined;
    const compact = (body: string) =>
        client === 'incy' ? compactIncySubscription(body, false) : body;
    let subscription: string;
    let header: string | undefined;
    try {
        subscription = compact(await generate(inline));
        if (
            client &&
            !xrayProfilesFit(
                subscription,
                budget,
                inline?.hasManagedRules && !inline.scopedProfiles
                    ? limit
                    : Number.POSITIVE_INFINITY,
            )
        )
            throw new ClientPoolError('geofile-client-config-size-limit');
        header = inline && subscription ? await inline.header(subscription, profileKey) : undefined;
    } catch (error) {
        const size =
            error instanceof Error &&
            [
                'geofile-inline-limit',
                'geofile-config-size',
                'geofile-client-config-size-limit',
                'geofile-xray-size',
            ].includes(error.message);
        if (!size || !client || manualRouting || inline?.scopedProfiles) throw error;
        // One oversized profile triggers a second render with compact DAT
        // references. Do not emit headers from the abandoned inline render.
        const remote = new XrayGeofileDelivery(client, 'remote', title, limit);
        try {
            const body = remote.resolveLegacyReferences(await generate(remote));
            const header = body ? await remote.header(body, profileKey) : undefined;
            subscription = compact(body);
            if (!header || remote.inlineOnly || !xrayProfilesFit(subscription, budget))
                throw new ClientPoolError('geofile-client-config-size-limit');
            return {
                subscription,
                header,
                intervalHours: remote.intervalHours,
                inline: false,
                sourceRevision: remote.sourceRevision,
            };
        } catch (failure) {
            if (failure instanceof XrayGeofileFallback)
                throw new ClientPoolError(`geofile-auto-delivery-unavailable: ${failure.reason}`);
            throw failure;
        }
    }
    return {
        subscription,
        header,
        intervalHours: inline?.intervalHours,
        inline: !inline?.hasRemoteRules,
        sourceRevision: inline?.sourceRevision,
    };
}
