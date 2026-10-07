import type { AxiosService, INodeConnectionOpts } from '@common/axios';
import type { RawCacheService } from '@common/raw-cache';

import type { HostPolicyService } from './host-policy.service';

export const hostPolicyRetryKey = (uuid: string) => `remnacust:host-policy:retry:${uuid}`;
export const HOST_POLICY_RETRY_MS = 60_000;
export const HOST_POLICY_PENDING = '[HOST_POLICY_PENDING]';
export const HOST_POLICY_UPGRADE_REQUIRED = '[HOST_POLICY_UPGRADE_REQUIRED]';

/** Keep a policy failure separate from the health of the already running core. */
export async function syncHostPolicyForStart(
    node: INodeConnectionOpts & { uuid: string },
    policies: Pick<HostPolicyService, 'syncNode'>,
    axios: Pick<AxiosService, 'getNodeHealth' | 'hostPolicy'>,
    cache: Pick<RawCacheService, 'set'>,
): Promise<{ ready: true } | { ready: false; running: boolean; message: string }> {
    try {
        await policies.syncNode(node);
        return { ready: true };
    } catch (error) {
        // Do not send a new config or grant users without its required policy.
        // Recheck health after I/O; a preflight response may already be stale.
        const live = await axios.getNodeHealth(node);
        const running = live.isOk && live.response.isAlive === true &&
            live.response.xrayInternalStatusCached === true;
        let upgradeRequired = false;
        if (live.isOk && error && typeof error === 'object' &&
            'code' in error && error.code === 'HOST_POLICY_NOT_APPLIED') {
            const capabilities = await axios.hostPolicy<{ version?: string; supported?: boolean }>(node);
            upgradeRequired = capabilities.isOk
                ? capabilities.response.supported !== true || capabilities.response.version !== 'xera-host-policy-v2'
                : ['NODE_HTTP_404', 'NODE_HTTP_405', 'ECONNRESET'].includes(capabilities.code ?? '') &&
                  !live.response.nodeVersion.includes('remnacust');
        }
        await cache.set(hostPolicyRetryKey(node.uuid), Date.now() + HOST_POLICY_RETRY_MS, 86_400);
        return {
            ready: false,
            running,
            message: `${upgradeRequired ? HOST_POLICY_UPGRADE_REQUIRED : HOST_POLICY_PENDING} Required host policy could not be applied. The new configuration was not sent; check node and Xray support.`,
        };
    }
}
