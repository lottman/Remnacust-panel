export const prepareImportUsers = (
    users: Array<Record<string, unknown>>,
    keepSquads: boolean
): Array<Record<string, unknown>> =>
    keepSquads ? users : users.map((user) => ({ ...user, activeInternalSquads: [] }))
