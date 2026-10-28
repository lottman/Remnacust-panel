export interface ISshSessionOptions {
    prepareNodeInstall?: () => Promise<import('../ssh/node-upgrade').NodeInstallContext>;
    onNodeOperation?: (id: string, running: boolean) => Promise<void>;
    authorizeNodeUpgrade?: () => Promise<void>;
    allowedHosts: string[];
    nodeAddress: string;
    nodePort: null | number;
    onOptimizationStatus?: (
        level: import('../ssh/optimization-status').OptimizationLevel | null,
    ) => Promise<void>;
    onClosed: (reason: string, durationSeconds: null | number) => void;
    onOpened: (target: string, username: string) => void;
    onTunnelReady: (port: number) => Promise<void>;
    onTunnelClosed: (port: number) => Promise<void>;
}
