import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '@common/database';
import { XrayModeService } from './xray-mode.service';
import { XrayModeInterceptor } from './xray-mode.interceptor';

@Global()
@Module({ imports: [PrismaModule], providers: [XrayModeService, { provide: APP_INTERCEPTOR, useClass: XrayModeInterceptor }], exports: [XrayModeService] })
export class XrayModeModule {}
