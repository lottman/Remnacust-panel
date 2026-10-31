import { ClientPoolError } from '../generators/client-pool';
import {
    compactIncySubscription,
    xrayProfilesFit,
    INCY_FORMATTED_CONFIG_BUDGET,
    XRAY_FORMATTED_CONFIG_BUDGET,
} from './incy-config';
import { XrayGeofileDelivery, XrayGeofileFallback } from './xray-geofile-delivery';

export async function automaticXrayDelivery(options: {
    client?: 'happ' | 'incy';
    manualRouting: boolean;
    title: string;
    profileKey: string;
    generate: (delivery?: XrayGeofileDelivery) => Promise<string>;
}): Promise<{ subscription: string; header?: string; intervalHours?: number; inline: boolean }> {
    const { client, manualRouting, title, profileKey, generate } = options;
    const budget = client === 'incy' ? INCY_FORMATTED_CONFIG_BUDGET : XRAY_FORMATTED_CONFIG_BUDGET;
    const inline =
        client && !manualRouting ? new XrayGeofileDelivery(client, 'inline', title) : undefined;
    const compact = (body: string) =>
        client === 'incy' ? compactIncySubscription(body, false) : body;
    let subscription: string;
    try {
        subscription = compact(await generate(inline));
        if (client && !xrayProfilesFit(subscription, budget))
            throw new ClientPoolError('geofile-client-config-size-limit');
    } catch (error) {
        const size =
            error instanceof Error &&
            [
                'geofile-inline-limit',
                'geofile-config-size',
                'geofile-client-config-size-limit',
            ].includes(error.message);
        if (!size || !client || manualRouting) throw error;
        // One oversized profile triggers a second render with compact DAT
        // references. Do not emit headers from the abandoned inline render.
        const remote = new XrayGeofileDelivery(client, 'remote', title);
        try {
            const body = await generate(remote);
            const header = body ? await remote.header(body, profileKey) : undefined;
            subscription = compact(body);
            if (!header || remote.inlineOnly || !xrayProfilesFit(subscription, budget))
                throw new ClientPoolError('geofile-client-config-size-limit');
            return { subscription, header, intervalHours: remote.intervalHours, inline: false };
        } catch (failure) {
            if (failure instanceof XrayGeofileFallback)
                throw new ClientPoolError(`geofile-auto-delivery-unavailable: ${failure.reason}`);
            throw failure;
        }
    }
    const header =
        inline && subscription ? await inline.header(subscription, profileKey) : undefined;
    return { subscription, header, intervalHours: inline?.intervalHours, inline: true };
}
