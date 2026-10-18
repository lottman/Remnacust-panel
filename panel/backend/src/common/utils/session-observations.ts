import { usageOwner } from './device-identity';

interface ObservedUser {
    userId: string;
    ips: { ip: string; lastSeen: Date }[];
}

// One owner may have several device/host identities on the same node.
export function sessionObservations(input: ObservedUser[]) {
    const owners = new Map<number, Map<string, { ip: string; lastSeen: Date }>>();
    let unmappedUsers = 0;
    for (const user of input) {
        const owner = usageOwner(user.userId);
        const userId = owner ? Number(owner) : NaN;
        if (!Number.isSafeInteger(userId) || userId <= 0) {
            unmappedUsers++;
            continue;
        }
        const ips = owners.get(userId) ?? new Map();
        for (const ip of user.ips) {
            const previous = ips.get(ip.ip);
            if (!previous || new Date(ip.lastSeen).getTime() > new Date(previous.lastSeen).getTime())
                ips.set(ip.ip, ip);
        }
        if (ips.size) owners.set(userId, ips);
    }
    return {
        users: [...owners].map(([userId, ips]) => ({ userId, ips: [...ips.values()] }))
            .sort((a, b) => a.userId - b.userId),
        unmappedUsers,
    };
}
