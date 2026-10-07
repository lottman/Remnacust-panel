import { CreateAdminHandler } from './create-admin';
import { CreatePasskeyHandler } from './create-passkey';
import { DeletePasskeyHandler } from './delete-passkey';
import { UpdatePasskeyHandler } from './update-passkey';

export const COMMANDS = [
    CreateAdminHandler,
    CreatePasskeyHandler,
    UpdatePasskeyHandler,
    DeletePasskeyHandler,
];
