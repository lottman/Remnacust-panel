import ms from 'enhanced-ms';

export function formatExecutionTime(startTime: number): string {
    return (
        ms(performance.now() - startTime, {
            useAbbreviations: true,
            unitLimit: 2,
            includeMs: true,
        }) || '0ms'
    );
}

export function getTime(): number {
    return performance.now();
}
