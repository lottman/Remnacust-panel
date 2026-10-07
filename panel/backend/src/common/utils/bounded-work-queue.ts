/** A per-process queue for optional background work. Callers retry rejected submissions. */
export class BoundedWorkQueue {
    private active = 0;
    private readonly waiting: (() => void)[] = [];

    constructor(private readonly concurrency: number, private readonly capacity: number) {
        if (!Number.isSafeInteger(concurrency) || concurrency < 1 ||
            !Number.isSafeInteger(capacity) || capacity < concurrency) {
            throw new Error('Invalid work queue limits');
        }
    }

    submit<T>(work: () => Promise<T>): Promise<T> | null {
        if (this.active + this.waiting.length >= this.capacity) return null;
        return new Promise<T>((resolve, reject) => {
            const start = () => {
                this.active++;
                const finish = () => {
                    this.active--;
                    this.waiting.shift()?.();
                };
                try {
                    Promise.resolve(work()).then(resolve, reject).finally(finish);
                } catch (error) {
                    reject(error);
                    finish();
                }
            };
            if (this.active < this.concurrency) start();
            else this.waiting.push(start);
        });
    }
}
