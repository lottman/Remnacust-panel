export class AddUserToNodeEvent {
    constructor(
        public readonly userId: bigint,
        public readonly prevVlessUuid?: string,
    ) {}
}
