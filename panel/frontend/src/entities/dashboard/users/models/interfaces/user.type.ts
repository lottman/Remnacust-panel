import { GetUsersCommand } from '@remnawave/backend-contract'

export type User = GetUsersCommand.Response['response']['users'][number]
