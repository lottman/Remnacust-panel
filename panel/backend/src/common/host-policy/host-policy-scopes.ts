import { PolicyGroup, PolicyHost, PolicyTag } from './host-policy.types';

export function buildPolicyGroups(hosts: PolicyHost[], tags: PolicyTag[]): PolicyGroup[] {
    const directNodes = (host: PolicyHost) =>
        host.nodes.length
            ? host.boundNodes.filter((id) => host.nodes.includes(id))
            : host.boundNodes;
    const owners = hosts.filter((host) => !host.quotaHostUuid);
    const bindings = new Map(owners.map((host) => [host.uuid, [host]]));
    for (const host of hosts) {
        if (host.quotaHostUuid) bindings.get(host.quotaHostUuid)?.push(host);
    }
    const ids = (host: PolicyHost) => (bindings.get(host.uuid) ?? [host]).map((h) => h.uuid);
    const nodes = (host: PolicyHost) => [
        ...new Set((bindings.get(host.uuid) ?? [host]).flatMap(directNodes)),
    ];
    const groups: PolicyGroup[] = owners.map((host) => ({
        key: `host:${host.uuid}`,
        hostUuids: ids(host),
        nodeUuids: nodes(host),
        userLimit: host.userLimit,
        trafficMultiplier: host.trafficMultiplier ?? 1,
        userSpeed: host.userSpeed,
        deviceSpeed: host.deviceSpeed ?? 0,
        totalSpeed: host.totalSpeed,
        anchor: host.anchor,
        resetValue: host.resetValue,
        resetUnit: host.resetUnit,
    }));
    for (const tag of tags) {
        const members = owners.filter((host) => host.tags.includes(tag.tag));
        const quotaMembers = members.filter((host) => host.useTagTrafficLimit !== false);
        const totalSpeedMembers = members.filter((host) => host.useTagTotalSpeedLimit !== false);
        // Quotas and shared speed have independent membership. Never attach a
        // quota's blocked owners to a host that only opts into shared speed.
        groups.push({
            ...tag,
            key: `tag:${tag.tag}`,
            userSpeed: 0,
            deviceSpeed: 0,
            totalSpeed: 0,
            hostUuids: quotaMembers.flatMap(ids),
            nodeUuids: [...new Set(quotaMembers.flatMap(nodes))],
        });
        if (tag.totalSpeed)
            groups.push({
                ...tag,
                key: `tag-total:${tag.tag}`,
                userSpeed: 0,
                deviceSpeed: 0,
                userLimit: null,
                trafficMultiplier: 1,
                hostUuids: totalSpeedMembers.flatMap(ids),
                nodeUuids: [...new Set(totalSpeedMembers.flatMap(nodes))],
            });
        // A tag assigns the same per-user speed to each host independently.
        if (tag.userSpeed)
            for (const host of members.filter((h) => h.useTagSpeedLimit !== false))
                groups.push({
                    ...tag,
                    key: `tag-host:${tag.tag}:${host.uuid}`,
                    hostUuids: ids(host),
                    nodeUuids: nodes(host),
                    userLimit: null,
                    trafficMultiplier: 1,
                    totalSpeed: 0,
                    deviceSpeed: 0,
                });
        if (tag.deviceSpeed)
            for (const host of members.filter((h) => h.useTagDeviceSpeedLimit !== false))
                groups.push({
                    ...tag,
                    key: `tag-device:${tag.tag}:${host.uuid}`,
                    hostUuids: ids(host),
                    nodeUuids: nodes(host),
                    userLimit: null,
                    userSpeed: 0,
                    trafficMultiplier: 1,
                    totalSpeed: 0,
                });
    }
    return groups;
}
