import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';

import { getJWTConfig } from '@common/config/jwt/jwt.config';

import { COMMANDS } from './commands';
import { KeygenController } from './keygen.controller';
import { KeygenConverter } from './keygen.converter';
import { KeygenService } from './keygen.service';
import { KeygenRepository } from './repositories/keygen.repository';

@Module({
    imports: [CqrsModule, JwtModule.registerAsync(getJWTConfig())],
    controllers: [KeygenController],
    providers: [KeygenRepository, KeygenService, KeygenConverter, ...COMMANDS],
})
export class KeygenModule {}
