import { PolicyGroup, PolicyHost, PolicyTag } from './host-policy.types';

export function buildPolicyGroups(hosts: PolicyHost[], tags: PolicyTag[]): PolicyGroup[] {
    const nodes = (host: PolicyHost) =>
        host.nodes.length
            ? host.boundNodes.filter((id) => host.nodes.includes(id))
            : host.boundNodes;
    const groups: PolicyGroup[] = hosts.map((host) => ({
        key: `host:${host.uuid}`,
        hostUuids: [host.uuid],
        nodeUuids: nodes(host),
        userLimit: host.userLimit,
        trafficMultiplier: host.trafficMultiplier ?? 1,
        userSpeed: host.userSpeed,
        totalSpeed: host.totalSpeed,
        anchor: host.anchor,
        resetValue: host.resetValue,
        resetUnit: host.resetUnit,
    }));
    for (const tag of tags) {
        const members = hosts.filter((host) => host.tags.includes(tag.tag));
        const quotaMembers = members.filter((host) => host.useTagTrafficLimit !== false);
        const totalSpeedMembers = members.filter((host) => host.useTagTotalSpeedLimit !== false);
        // Quotas and shared speed have independent membership. Never attach a
        // quota's blocked owners to a host that only opts into shared speed.
        groups.push({
            ...tag,
            key: `tag:${tag.tag}`,
            userSpeed: 0,
            totalSpeed: 0,
            hostUuids: quotaMembers.map((host) => host.uuid),
            nodeUuids: [...new Set(quotaMembers.flatMap(nodes))],
        });
        if (tag.totalSpeed)
            groups.push({
                ...tag,
                key: `tag-total:${tag.tag}`,
                userSpeed: 0,
                userLimit: null,
                trafficMultiplier: 1,
                hostUuids: totalSpeedMembers.map((host) => host.uuid),
                nodeUuids: [...new Set(totalSpeedMembers.flatMap(nodes))],
            });
        // A tag assigns the same per-user speed to each host independently.
        if (tag.userSpeed)
            for (const host of members.filter((h) => h.useTagSpeedLimit !== false))
                groups.push({
                    ...tag,
                    key: `tag-host:${tag.tag}:${host.uuid}`,
                    hostUuids: [host.uuid],
                    nodeUuids: nodes(host),
                    userLimit: null,
                    trafficMultiplier: 1,
                    totalSpeed: 0,
                });
    }
    return groups;
}
