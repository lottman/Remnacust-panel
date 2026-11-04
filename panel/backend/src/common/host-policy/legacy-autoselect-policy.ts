import type { PolicySnapshot } from './host-policy.types';

export function legacyAutoselectPolicy(state: PolicySnapshot): PolicySnapshot {
    const hosts = state.hosts.filter((host) => !host.quotaHostUuid);
    const byId = new Map(hosts.map((host) => [host.uuid, host]));
    return {
        ...state,
        hosts,
        identities: state.identities.filter((identity) => !identity.quotaHostUuid),
        groups: state.groups.map((group) => {
            const hostUuids = group.hostUuids.filter((id) => byId.has(id));
            const nodeUuids = [
                ...new Set(
                    hostUuids.flatMap((id) => {
                        const host = byId.get(id)!;
                        return host.nodes.length
                            ? host.boundNodes.filter((node) => host.nodes.includes(node))
                            : host.boundNodes;
                    }),
                ),
            ];
            return { ...group, hostUuids, nodeUuids };
        }),
    };
}
