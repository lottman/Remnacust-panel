export interface SessionObservation {
    userId: number;
    nodeUuid: string;
    nodeName: string;
    countryCode: string;
    ip: string;
    lastSeen: string;
    firstObservedAt: string;
    lastObservedAt: string;
    samples: number;
}

export interface RecordingState {
    observations: SessionObservation[];
    polls: number;
    failedNodePolls: number;
    offlineNodePolls: number;
    lastFailures: string[];
    truncated: boolean;
}

export const EMPTY_RECORDING = (): RecordingState => ({
    observations: [],
    polls: 0,
    failedNodePolls: 0,
    offlineNodePolls: 0,
    lastFailures: [],
    truncated: false,
});

// Keep a recording bounded regardless of node/user count. Never silently drop data.
export const MAX_OBSERVATIONS = 20_000;
export function mergeObservations(state: RecordingState, incoming: SessionObservation[]): void {
    const key = (item: SessionObservation) => JSON.stringify([item.userId, item.nodeUuid, item.ip]);
    const index = new Map(state.observations.map((item) => [key(item), item]));
    for (const item of incoming) {
        const old = index.get(key(item));
        if (old) {
            old.lastObservedAt = item.lastObservedAt;
            old.lastSeen = item.lastSeen;
            old.nodeName = item.nodeName;
            old.countryCode = item.countryCode;
            old.samples++;
        } else if (index.size < MAX_OBSERVATIONS) {
            index.set(key(item), item);
            state.observations.push(item);
        } else state.truncated = true;
    }
}
