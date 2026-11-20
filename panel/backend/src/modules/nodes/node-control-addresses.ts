import {
    NODE_CONTROL_ADDRESS_LIMIT,
    NodeControlAddressesSchema,
    normalizeNodeControlAddress,
    type TNodeControlAddresses,
} from '../../../libs/contract/models/node-control-addresses.schema';

type AddressState = {
    address?: string;
    ips?: { ip: string; status: string }[];
    controlAddresses?: TNodeControlAddresses;
};

export class NodeControlAddressLimitError extends Error {}
export class NodeControlRevisionConflictError extends Error {}
export class NodeLastControlAddressError extends Error {}

export function configuredNodeAddresses(state: AddressState): string[] {
    return [
        ...new Set(
            [
                ...(state.controlAddresses ?? []).map((row) => row.address),
                ...(state.controlAddresses == null ? [state.address ?? ''] : []),
                ...(state.ips ?? []).map((row) => row.ip),
            ]
                .map(normalizeNodeControlAddress)
                .filter((address): address is string => address !== null),
        ),
    ];
}

export function canonicalNodeControlAddresses(value: unknown): TNodeControlAddresses {
    const rows = new Map<string, boolean>();
    for (const row of Array.isArray(value) ? value.slice(0, NODE_CONTROL_ADDRESS_LIMIT) : []) {
        if (
            !row ||
            typeof row !== 'object' ||
            typeof row.address !== 'string' ||
            typeof row.enabled !== 'boolean'
        )
            continue;
        const address = normalizeNodeControlAddress(row.address);
        if (address) rows.set(address, rows.get(address) === true || row.enabled);
    }
    return [...rows].map(([address, enabled]) => ({ address, enabled }));
}

export function legacyNodeControlAddresses(state: AddressState): TNodeControlAddresses {
    const rows = new Map<string, boolean>();
    const primary = state.address && normalizeNodeControlAddress(state.address);
    if (primary) rows.set(primary, true);
    for (const row of state.ips ?? []) {
        const address = normalizeNodeControlAddress(row.ip);
        if (address)
            rows.set(
                address,
                rows.get(address) === true ||
                    row.status === 'MANAGEMENT' ||
                    row.status === 'RESERVE',
            );
    }
    return [...rows]
        .slice(0, NODE_CONTROL_ADDRESS_LIMIT)
        .map(([address, enabled]) => ({ address, enabled }));
}

export function reconcileNodeControlAddresses(
    before: AddressState,
    patch: AddressState,
    removed: ReadonlySet<string> = new Set(),
): TNodeControlAddresses {
    const previous =
        before.controlAddresses === undefined
            ? legacyNodeControlAddresses(before)
            : canonicalNodeControlAddresses(before.controlAddresses);
    if (patch.controlAddresses !== undefined) {
        const requested = NodeControlAddressesSchema.parse(patch.controlAddresses);
        const addresses = new Set(requested.map((row) => row.address));
        const merged = [
            ...requested,
            ...previous
                .filter((row) => !addresses.has(row.address) && !removed.has(row.address))
                .map((row) => ({ ...row, enabled: false })),
        ];
        if (merged.length > NODE_CONTROL_ADDRESS_LIMIT) throw new NodeControlAddressLimitError();
        return merged;
    }
    const rows = new Map(previous.map((row) => [row.address, row.enabled]));
    if (patch.ips !== undefined) {
        const currentIps = new Map<string | null, boolean>();
        for (const row of patch.ips) {
            const address = normalizeNodeControlAddress(row.ip);
            currentIps.set(
                address,
                currentIps.get(address) === true ||
                    row.status === 'MANAGEMENT' ||
                    row.status === 'RESERVE',
            );
        }
        for (const old of before.ips ?? []) {
            const address = normalizeNodeControlAddress(old.ip);
            if (
                address &&
                address !== normalizeNodeControlAddress(before.address ?? '') &&
                !currentIps.has(address)
            )
                rows.set(address, false);
        }
        for (const [address, enabled] of currentIps) {
            if (address && !rows.has(address)) rows.set(address, enabled);
        }
    }
    const primary = patch.address && normalizeNodeControlAddress(patch.address);
    const changedPrimary = primary && primary !== normalizeNodeControlAddress(before.address ?? '');
    if (changedPrimary) {
        rows.delete(primary);
        rows.set(primary, true);
    }
    let merged = [...rows].map(([address, enabled]) => ({ address, enabled }));
    if (changedPrimary) merged = [merged[merged.length - 1], ...merged.slice(0, -1)];
    if (merged.length > NODE_CONTROL_ADDRESS_LIMIT) throw new NodeControlAddressLimitError();
    return merged;
}
