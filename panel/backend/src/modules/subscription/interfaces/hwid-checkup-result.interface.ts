export interface IHwidCheckupResult {
    subscriptionAllowed: boolean;
    maxDeviceReached: boolean;
    hwidNotSupported: boolean;
    limitBypassed: boolean;
    deviceBlocked: boolean;
    registrationBlocked?: boolean;
}
