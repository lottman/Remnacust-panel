export function stockHostPolicy<T extends object>(host: T): T {
    return Object.assign(Object.create(Object.getPrototypeOf(host)), host, {
        alwaysAvailable: false, onlyWhenInactive: false, userTrafficLimitBytes: null,
        speedLimitMbps: null, serverSpeedLimitMbps: null, deviceSpeedLimitMbps: null,
        totalSpeedLimitMbps: null, domainRules: null, trafficMultiplier: 1,
        effectiveLimitBytes: 0n, tagTrafficLimits: [], trafficPaused: false, ambiguousTraffic: false,
    });
}
