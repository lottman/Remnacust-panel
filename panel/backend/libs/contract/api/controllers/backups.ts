export const BACKUPS_CONTROLLER = 'backups' as const;

export const BACKUPS_ROUTES = {
    LIST: '', // get
    CREATE: 'create', // post
    DELETE: 'delete', // post
    SEND: 'send', // post
    SETTINGS: 'settings', // get
    SETTINGS_UPDATE: 'settings', // patch
} as const;
