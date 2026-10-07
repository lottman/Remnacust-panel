/** Map the compatible port-hopping subset of Finalmask to Hysteria clients. */
export function getUdpHop(finalMask: Record<string, unknown> | null):
    { ports?: number | string; interval?: number | string } | undefined {
    const quic = finalMask?.quicParams as { udpHop?: { ports?: number | string; interval?: number | string } } | undefined;
    if (quic?.udpHop) return quic.udpHop;
    const masks = finalMask?.udp;
    if (!Array.isArray(masks)) return undefined;
    const hop = masks.find(mask => mask?.type === 'udphop')?.settings;
    if (!hop || (Array.isArray(hop.remoteIPs) && hop.remoteIPs.length)) return undefined;
    const modes = String(hop.mode ?? '').toLowerCase().split(',');
    if (!modes.includes('intervalremote') || modes.some(mode => !['intervalremote', 'perconnremote'].includes(mode))) return undefined;
    const interval = hop.interval ?? 30;
    // Other client formats cannot express Xray interval ranges or address hopping.
    if (!/^\d+$/.test(String(interval))) return undefined;
    return { ports: hop.remotePorts, interval };
}
