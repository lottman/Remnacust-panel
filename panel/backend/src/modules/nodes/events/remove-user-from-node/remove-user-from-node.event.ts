export class RemoveUserFromNodeEvent {
    constructor(
        public readonly id: bigint,
        public readonly vlessUuid: string,
        public readonly deviceHwids?: string[],
    ) {}
}
