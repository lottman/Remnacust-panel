import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnvConfig } from '@common/utils/validate-env-config';

import { configSchema, Env } from '../app-config';
import notificationsConfig from '../app-config/notifications.config';
import { TypedConfigService } from '../app-config/typed-config.service';
import { NotificationsConfigService } from './notifications-config.service';

@Global()
@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            cache: true,
            envFilePath: '.env',
            validate: (config) => validateEnvConfig<Env>(configSchema, config),
            load: [notificationsConfig],
        }),
    ],
    providers: [NotificationsConfigService, TypedConfigService],
    exports: [NotificationsConfigService, TypedConfigService],
})
export class CommonConfigModule {}
