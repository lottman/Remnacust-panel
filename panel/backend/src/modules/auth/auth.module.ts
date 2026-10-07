import { HttpModule } from '@nestjs/axios';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';

import { getJWTConfig } from '@common/config/jwt/jwt.config';

import { AuthController } from './auth.controller';
import { AuthSessionController } from './auth-session.controller';
import { AuthService } from './auth.service';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { COMMANDS } from './commands';
import { InjectRemnawaveSettingsMiddleware } from './middlewares/inject-remnawave-settings';
import { JwtStrategy } from './strategies';

@Module({
    imports: [CqrsModule, JwtModule.registerAsync(getJWTConfig()), HttpModule],
    controllers: [AuthController, AuthSessionController],
    providers: [JwtStrategy, AuthService, AuthRateLimitGuard, ...COMMANDS],
})
export class AuthModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(InjectRemnawaveSettingsMiddleware).forRoutes(AuthController);
    }
}
