export const SUBSCRIPTION_DOMAINS_CONTROLLER = 'subscription-domains' as const;

export const SUBSCRIPTION_DOMAINS_ROUTES = {
    GET_ALL: '', // get
    GET: (uuid: string) => `${uuid}`, // get
    CREATE: '', // post
    UPDATE: (uuid: string) => `${uuid}`, // patch
    DELETE: (uuid: string) => `${uuid}`, // delete
} as const;
