import { Worker } from 'node:worker_threads';

// Patterns remain data; only this fixed program executes in the worker.
const WORKER = String.raw`
const { parentPort } = require('node:worker_threads');
const cache = new Map();
parentPort.on('message', ({ id, pattern, input, flags, progress }) => {
    const state = new Int32Array(progress, 0, 2);
    const clock = new BigInt64Array(progress, 8, 2);
    Atomics.store(clock, 0, process.hrtime.bigint());
    Atomics.store(state, 0, 1);
    let result = -1;
    try {
        const key = flags + '\0' + pattern;
        let regex = cache.get(key);
        if (!regex) {
            regex = new RegExp(pattern, flags);
            if (cache.size >= 64) cache.delete(cache.keys().next().value);
            cache.set(key, regex);
        }
        result = regex.test(input) ? 1 : 0;
    } catch {}
    Atomics.store(state, 1, result);
    Atomics.store(clock, 1, process.hrtime.bigint());
    Atomics.store(state, 0, 2);
    parentPort.postMessage({ id });
});
parentPort.postMessage('ready');
`;

export class RegexBudgetError extends Error {
    constructor() {
        super('Regular expression evaluation is unavailable or exceeded its budget');
    }
}

type Task = {
    id: number;
    progress: SharedArrayBuffer;
    deadlineNs: bigint;
    pattern: string;
    input: string;
    flags: string;
    deadline: number;
    resolve: (value: boolean) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
};
type Slot = { worker: Worker; ready: boolean; retiring: boolean; task?: Task };

/** Bound both CPU concurrency and waiting work; never run configured regex on the API thread. */
export class BoundedRegexPool {
    private readonly slots = new Set<Slot>();
    private readonly queue: Task[] = [];
    private closed = false;
    private nextId = 0;

    constructor(
        private readonly size = 2,
        private readonly maximumPending = 32,
        private readonly executionTimeoutMs = 50,
        private readonly queueTimeoutMs = 1000,
    ) {}

    test(
        pattern: string,
        input: string,
        flags = '',
        deadline = Date.now() + this.queueTimeoutMs,
    ): Promise<boolean> {
        if (
            this.closed ||
            pattern.length > 2048 ||
            input.length > 16384 ||
            !['', 'i'].includes(flags) ||
            this.pending >= this.maximumPending ||
            deadline <= Date.now()
        ) {
            return Promise.reject(new RegexBudgetError());
        }
        return new Promise((resolve, reject) => {
            const task: Task = {
                id: ++this.nextId,
                progress: new SharedArrayBuffer(24),
                deadlineNs:
                    process.hrtime.bigint() +
                    BigInt(Math.max(0, Math.floor(deadline - Date.now()))) * 1_000_000n,
                pattern,
                input,
                flags,
                deadline,
                resolve,
                reject,
                timer: setTimeout(
                    () => {
                        const index = this.queue.indexOf(task);
                        if (index !== -1) {
                            this.queue.splice(index, 1);
                            reject(new RegexBudgetError());
                        }
                    },
                    Math.min(this.queueTimeoutMs, deadline - Date.now()),
                ),
            };
            this.queue.push(task);
            this.pump();
        });
    }

    get pending(): number {
        return this.queue.length + [...this.slots].filter((slot) => slot.task).length;
    }

    get workers(): number {
        return this.slots.size;
    }

    private fail(slot: Slot): void {
        if (slot.task) {
            clearTimeout(slot.task.timer);
            slot.task.reject(new RegexBudgetError());
            slot.task = undefined;
        }
        if (!slot.retiring) {
            slot.retiring = true;
            void slot.worker.terminate();
        }
    }

    private complete(slot: Slot): void {
        const task = slot.task;
        if (!task) return;
        const state = new Int32Array(task.progress, 0, 2);
        if (Atomics.load(state, 0) !== 2) return;
        const clock = new BigInt64Array(task.progress, 8, 2);
        const start = Atomics.load(clock, 0),
            end = Atomics.load(clock, 1);
        if (
            end < start ||
            end > task.deadlineNs ||
            end - start > BigInt(this.executionTimeoutMs) * 1_000_000n
        ) {
            this.fail(slot);
            return;
        }
        clearTimeout(task.timer);
        slot.task = undefined;
        const result = Atomics.load(state, 1);
        if (result === 0 || result === 1) task.resolve(result === 1);
        else task.reject(new RegexBudgetError());
        this.pump();
    }

    private watch(slot: Slot, task: Task): void {
        if (slot.task !== task || slot.retiring) return;
        const state = new Int32Array(task.progress, 0, 2);
        if (Atomics.load(state, 0) === 2) {
            this.complete(slot);
            return;
        }
        const now = process.hrtime.bigint();
        const started = Atomics.load(new BigInt64Array(task.progress, 8, 2), 0);
        const remaining = Number(task.deadlineNs - now) / 1_000_000;
        const elapsed = started ? Number(now - started) / 1_000_000 : 0;
        if (remaining <= 0 || elapsed >= this.executionTimeoutMs) {
            this.fail(slot);
            return;
        }
        task.timer = setTimeout(
            () => this.watch(slot, task),
            Math.max(1, Math.min(remaining, this.executionTimeoutMs - elapsed)),
        );
    }

    private spawn(): void {
        const worker = new Worker(WORKER, {
            eval: true,
            env: {},
            execArgv: [],
            resourceLimits: { maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 4 },
        });
        const slot: Slot = { worker, ready: false, retiring: false };
        this.slots.add(slot);
        worker.on('message', (value) => {
            if (slot.retiring) return;
            if (value === 'ready') slot.ready = true;
            else if (slot.task && value?.id === slot.task.id) this.complete(slot);
            this.pump();
        });
        worker.on('error', () => this.fail(slot));
        worker.on('exit', () => {
            this.fail(slot);
            this.slots.delete(slot);
            this.pump();
        });
        worker.unref();
    }

    private pump(): void {
        if (this.closed) return;
        for (const slot of this.slots) {
            if (!this.queue.length) break;
            if (!slot.ready || slot.retiring || slot.task) continue;
            let task = this.queue.shift()!;
            let remaining = task.deadline - Date.now();
            while (remaining <= 0) {
                clearTimeout(task.timer);
                task.reject(new RegexBudgetError());
                if (!this.queue.length) break;
                task = this.queue.shift()!;
                remaining = task.deadline - Date.now();
            }
            if (remaining <= 0) continue;
            clearTimeout(task.timer);
            task.timer = setTimeout(
                () => this.watch(slot, task),
                Math.min(this.executionTimeoutMs, remaining),
            );
            slot.task = task;
            try {
                slot.worker.postMessage({
                    id: task.id,
                    progress: task.progress,
                    pattern: task.pattern,
                    input: task.input,
                    flags: task.flags,
                });
            } catch {
                this.fail(slot);
            }
        }
        const starting = [...this.slots].filter((slot) => !slot.ready && !slot.retiring).length;
        if (this.queue.length > starting && this.slots.size < this.size) {
            try {
                this.spawn();
            } catch {
                const task = this.queue.shift()!;
                clearTimeout(task.timer);
                task.reject(new RegexBudgetError());
            }
            this.pump();
        }
    }

    async close(): Promise<void> {
        this.closed = true;
        for (const task of this.queue.splice(0)) {
            clearTimeout(task.timer);
            task.reject(new RegexBudgetError());
        }
        const workers = [...this.slots];
        for (const slot of workers) this.fail(slot);
        await Promise.all(workers.map((slot) => slot.worker.terminate()));
    }
}

export const configuredRegex = new BoundedRegexPool();
