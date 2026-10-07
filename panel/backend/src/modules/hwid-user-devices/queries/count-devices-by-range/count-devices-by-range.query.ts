export class CountDevicesByRangeQuery {
    constructor(
        public readonly start: Date,
        public readonly endExclusive: Date,
    ) {}
}
