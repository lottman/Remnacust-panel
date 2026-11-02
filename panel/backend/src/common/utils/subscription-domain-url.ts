export type PublicSubscriptionDomain = {
    uuid: string;
    domain: string;
    path: string;
    kind: string;
};

export function subscriptionDomainBase(domain: PublicSubscriptionDomain): string {
    return `https://${domain.domain}${domain.path}`;
}

export function subscriptionUserUrl(
    domain: PublicSubscriptionDomain | null | undefined,
    fallback: string,
    shortUuid: string,
): string {
    return `${domain ? subscriptionDomainBase(domain) : `https://${fallback}`}/${shortUuid}`;
}
