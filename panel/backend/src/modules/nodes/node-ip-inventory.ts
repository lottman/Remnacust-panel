import { z } from 'zod';

import {
    NodeControlAddressesSchema,
    normalizeNodeControlAddress,
    type TNodeControlAddresses,
} from '../../../libs/contract/models/node-control-addresses.schema';
import { NodeIpsSchema, type TNodeIps } from '../../../libs/contract/models/node-ips.schema';
import { NodeControlAddressLimitError } from './node-control-addresses';

const AddressesSchema = z.array(z.union([z.ipv4(), z.ipv6()])).max(64);

export type NodeIpInventoryState = {
    addresses: string[];
    generatedAddresses: string[];
    revision: string;
    scannedAt: Date;
};

export function normalizeNodeIpInventory(value: unknown): string[] {
    return [
        ...new Set(
            AddressesSchema.parse(value).map((address) => normalizeNodeControlAddress(address)!),
        ),
    ];
}

export function planNodeIpInventory(
    before: {
        address: string;
        ips: TNodeIps;
        controlAddresses: TNodeControlAddresses;
        ipInventory?: Pick<NodeIpInventoryState, 'addresses' | 'generatedAddresses'> | null;
    },
    input: unknown,
    mode: 'initial' | 'append' | 'refresh',
) {
    const addresses = normalizeNodeIpInventory(input);
    const observed = new Set(addresses);
    const previous = NodeControlAddressesSchema.parse(before.controlAddresses);
    const generated = new Set(
        normalizeNodeIpInventory(before.ipInventory?.generatedAddresses ?? []),
    );
    const enabled = previous.some((row) => row.enabled);
    const controlAddresses = previous
        .filter(
            (row) => mode !== 'refresh' || !generated.has(row.address) || observed.has(row.address),
        )
        .map((row) => ({ ...row }));
    const retained = new Set(controlAddresses.map((row) => row.address));
    const generatedAddresses = controlAddresses
        .filter((row) => generated.has(row.address))
        .map((row) => row.address);
    for (const address of addresses) {
        if (retained.has(address)) continue;
        controlAddresses.push({ address, enabled });
        generatedAddresses.push(address);
        retained.add(address);
    }
    if (controlAddresses.length > 65)
        throw new NodeControlAddressLimitError('A node can retain at most 65 control addresses');
    const statuses = new Map(
        NodeIpsSchema.parse(before.ips).map((row) => [
            normalizeNodeControlAddress(row.ip)!,
            row.status,
        ]),
    );
    const retainedIps = [...statuses.keys()].filter(
        (ip) => mode !== 'refresh' || !generated.has(ip) || observed.has(ip),
    );
    const inventoryAddresses = [...new Set([...retainedIps, ...addresses])];
    if (inventoryAddresses.length > 64)
        throw new NodeControlAddressLimitError(
            'A node can retain at most 64 discovered IP addresses',
        );
    const ips: TNodeIps = inventoryAddresses.map((ip) => ({
        ip,
        status: statuses.get(ip) ?? 'INBOUND',
    }));
    return { addresses: [...addresses], controlAddresses, generatedAddresses, ips };
}
