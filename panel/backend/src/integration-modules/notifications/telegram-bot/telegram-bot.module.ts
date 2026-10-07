import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { TELEGRAM_BOT_EVENTS } from './events';
import { TelegramApiService } from './telegram-api.service';

@Module({
    imports: [ConfigModule],
    controllers: [],
    providers: [TelegramApiService, ...TELEGRAM_BOT_EVENTS],
    exports: [TelegramApiService],
})
export class TelegramBotModule {}
