import { Passkeys } from '@prisma/client';
import { AuthenticatorTransport } from '@simplewebauthn/server';

type TTransports = AuthenticatorTransport;

export class PasskeyEntity implements Passkeys {
    public id: string;
    public adminUuid: string;
    public publicKey: Uint8Array<ArrayBuffer>;
    public counter: bigint;
    public deviceType: string;
    public backedUp: boolean;
    public transports: string | null;
    public passkeyProvider: string | null;
    public createdAt: Date;
    public updatedAt: Date;

    constructor(passkey: Partial<Passkeys>) {
        Object.assign(this, passkey);
        return this;
    }

    public getTransports(): TTransports[] {
        if (!this.transports) return [];
        return this.transports.split(',').map((transport) => transport as TTransports);
    }
}
