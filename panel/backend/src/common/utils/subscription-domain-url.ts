export type PublicSubscriptionDomain = {
    uuid: string;
    domain: string;
    path: string;
    kind: string;
};

export function subscriptionDomainBase(domain: PublicSubscriptionDomain): string {
    const prefix = domain.kind === 'CDN' ? `/cdn/${domain.uuid}` : '';
    return `https://${domain.domain}${domain.path}${prefix}`;
}

export function subscriptionUserUrl(
    domain: PublicSubscriptionDomain | null | undefined,
    fallback: string,
    shortUuid: string,
): string {
    return `${domain ? subscriptionDomainBase(domain) : `https://${fallback}`}/${shortUuid}`;
}
