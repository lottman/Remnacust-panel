import { RemnawaveSettings } from '@prisma/client';

import {
    TBrandingSettings,
    TOauth2Settings,
    TPasswordAuthSettings,
    TRemnawavePasskeySettings,
} from '@libs/contracts/models';

export class RemnawaveSettingsEntity implements RemnawaveSettings {
    public id: number;
    public passkeySettings: TRemnawavePasskeySettings;
    public oauth2Settings: TOauth2Settings;
    public passwordSettings: TPasswordAuthSettings;
    public brandingSettings: TBrandingSettings;
    public backupSettings: import('@libs/contracts/models/backup-settings.schema').TBackupSettings | null;

    constructor(remnawaveSettings: Partial<RemnawaveSettings>) {
        Object.assign(this, remnawaveSettings);
        return this;
    }
}
