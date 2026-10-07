export class RemoveUsersFromNodeEvent {
    constructor(
        public readonly users: {
            id: bigint;
            vlessUuid: string;
            deviceHwids?: string[];
        }[],
    ) {}
}
