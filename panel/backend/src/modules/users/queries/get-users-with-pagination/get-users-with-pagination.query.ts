export class GetUsersWithPaginationQuery {
    constructor(
        public readonly start: number,
        public readonly size: number,
        public readonly beforeId?: bigint,
    ) {}
}
