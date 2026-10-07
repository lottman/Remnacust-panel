import { AddUserToNodeHandler } from './add-user-to-node';
import { AddUsersToNodeHandler } from './add-users-to-node';
import { RemoveUserFromNodeHandler } from './remove-user-from-node';
import { RemoveUsersFromNodeHandler } from './remove-users-from-node';

export const EVENTS = [
    AddUserToNodeHandler,
    RemoveUserFromNodeHandler,
    AddUsersToNodeHandler,
    RemoveUsersFromNodeHandler,
];
