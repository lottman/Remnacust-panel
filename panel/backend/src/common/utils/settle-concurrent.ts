/** Wait for every target, including failures, without unbounded network fan-out. */
export async function settleConcurrent<T, R>(
    items: readonly T[],
    concurrency: number,
    action: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1)
        throw new RangeError('Concurrency must be a positive integer');
    const results: PromiseSettledResult<R>[] = [];
    let cursor = 0;
    await Promise.all(
        Array.from({ length: Math.min(concurrency, items.length) }, async () => {
            while (cursor < items.length) {
                const index = cursor++;
                try {
                    results[index] = { status: 'fulfilled', value: await action(items[index]) };
                } catch (reason) {
                    results[index] = { status: 'rejected', reason };
                }
            }
        }),
    );
    return results;
}
