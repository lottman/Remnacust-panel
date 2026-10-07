import { CountAdminsByRoleHandler } from './count-admins-by-role';
import { FindPasskeyByIdAndAdminUuidHandler } from './find-passkey-by-id-and-uuid';
import { GetAdminByUsernameHandler } from './get-admin-by-username';
import { GetAdminByUuidHandler } from './get-admin-by-uuid';
import { GetFirstAdminHandler } from './get-first-admin';
import { GetPasskeysByAdminUuidHandler } from './get-passkeys-by-admin-uuid';

export const QUERIES = [
    GetAdminByUsernameHandler,
    CountAdminsByRoleHandler,
    GetFirstAdminHandler,
    GetAdminByUuidHandler,
    GetPasskeysByAdminUuidHandler,
    FindPasskeyByIdAndAdminUuidHandler,
];
