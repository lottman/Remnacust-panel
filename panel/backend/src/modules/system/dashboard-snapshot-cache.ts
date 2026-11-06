interface Entry<T> {
    value?: T;
    pending?: Promise<T>;
    expiresAt: number;
}

export class DashboardSnapshotCache<T> {
    private readonly entries = new Map<string, Entry<T>>();

    constructor(
        private readonly capacity: number,
        private readonly ttl: number,
        private readonly errorTtl: number,
        private readonly successful: (value: T) => boolean,
        private readonly now: () => number = () => performance.now(),
    ) {}

    async get(key: string, load: () => Promise<T>): Promise<T> {
        let entry = this.entries.get(key);
        if (entry?.pending) return entry.pending;
        if (entry && entry.expiresAt > this.now()) return entry.value!;
        if (!entry) {
            if (this.entries.size >= this.capacity) {
                const removable = [...this.entries].find(([, value]) => !value.pending);
                if (!removable) throw new Error('Dashboard snapshot capacity reached');
                this.entries.delete(removable[0]);
            }
            entry = { expiresAt: 0 };
            this.entries.set(key, entry);
        }
        const target = entry;
        const pending = Promise.resolve()
            .then(load)
            .then((value) => {
                target.value = value;
                target.expiresAt = this.now() + (this.successful(value) ? this.ttl : this.errorTtl);
                return value;
            })
            .finally(() => {
                if (target.pending === pending) target.pending = undefined;
                if (target.value === undefined && this.entries.get(key) === target)
                    this.entries.delete(key);
            });
        target.pending = pending;
        return pending;
    }
}
