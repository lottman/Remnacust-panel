import { ConfigProfileInboundEntity } from '@modules/config-profiles/entities';
import { decryptSecret } from '@common/utils/xera-crypto';

export class UserWithResolvedInboundEntity {
    public id: bigint;
    public status: string;
    public trojanPassword: string;
    public vlessUuid: string;
    public ssPassword: string;

    public inbounds: ConfigProfileInboundEntity[];

    constructor(data: UserWithResolvedInboundEntity) {
        this.id = data.id;
        this.status = data.status;
        this.trojanPassword = decryptSecret(data.trojanPassword);
        this.vlessUuid = decryptSecret(data.vlessUuid);
        this.ssPassword = decryptSecret(data.ssPassword);
        this.inbounds = data.inbounds;
    }
}
