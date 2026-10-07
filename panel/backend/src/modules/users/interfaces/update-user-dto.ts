import { BaseUserEntity } from '../entities/base-users.entity';

export interface IUpdateUserDto extends Partial<BaseUserEntity> {
    id: bigint;
    activeInternalSquads?: string[];
}
