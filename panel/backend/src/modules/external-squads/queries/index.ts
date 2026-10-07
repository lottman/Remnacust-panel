import { GetCachedExternalSquadSettingsHandler } from './get-cached-external-squad-settings';
import { GetExternalSquadSettingsHandler } from './get-external-squad-settings';
import { GetCachedTemplateNameHandler } from './get-template-name';

export const QUERIES = [
    GetCachedTemplateNameHandler,
    GetExternalSquadSettingsHandler,
    GetCachedExternalSquadSettingsHandler,
];
