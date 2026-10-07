import { Get, Controller } from '@nestjs/common';

import { APP_CONFIG_ROUTE_WO_LEADING_PATH } from '@remnawave/subscription-page-types';

import type { IJwtPayload } from '@common/constants';
import { GetJWTPayload } from '@common/decorators/get-jwt-payload';

import { WebpageService } from './webpage.service';

@Controller()
export class WebpageController {
    constructor(private readonly webpageService: WebpageService) {}

    @Get(APP_CONFIG_ROUTE_WO_LEADING_PATH)
    async getSubscriptionPageConfig(@GetJWTPayload() user: IJwtPayload) {
        return await this.webpageService.getSubscriptionPageConfig(user.su);
    }
}
