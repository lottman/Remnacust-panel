import { ROLE } from '@contract/constants';
import { z } from 'zod';

import {
    Body,
    Controller,
    Header,
    HttpCode,
    Param,
    Post,
    UseFilters,
    UseGuards,
    BadRequestException,
    HttpException,
} from '@nestjs/common';

import { AdminOnlyEndpoint } from '@common/decorators/admin-only-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles/roles.guard';
import { ScopesGuard } from '@common/guards/scopes';
import { RawCacheService } from '@common/raw-cache';

import { SubscriptionService } from '../subscription.service';

const input = z.strictObject({
    hwid: z.string().regex(/^[a-zA-Z0-9=-]{10,64}$/),
    path: z.enum(['base', 'json', 'mihomo', 'clash', 'singbox', 'stash']),
    userAgent: z
        .string()
        .min(1)
        .max(512)
        .refine(
            (value) => !Array.from(value).some((char) => [0, 10, 13].includes(char.charCodeAt(0))),
        )
        .optional(),
    includeConfig: z.boolean().default(false),
});
@Controller('subscriptions/preview')
@Roles(ROLE.ADMIN)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
export class SubscriptionPreviewController {
    constructor(
        private readonly subscriptions: SubscriptionService,
        private readonly cache: RawCacheService,
    ) {}
    @Post(':userId')
    @HttpCode(200)
    @Header('Cache-Control', 'private, no-store')
    @AdminOnlyEndpoint()
    async preview(@Param('userId') id: string, @Body() body: unknown) {
        if (!/^[1-9][0-9]{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n)
            throw new BadRequestException('Invalid user ID');
        const parsed = input.safeParse(body);
        if (!parsed.success) throw new BadRequestException('Invalid preview request');
        if (
            (await this.cache.incrementWithTtl(
                `remnacust:subscription-preview:${id}:${Math.floor(Date.now() / 10000)}`,
                20,
            )) > 2
        )
            throw new HttpException('Wait before repeating preview', 429);
        const p = parsed.data;
        return {
            response: await this.subscriptions.previewDevice(
                BigInt(id),
                p.hwid,
                p.path,
                p.userAgent,
                p.includeConfig,
            ),
        };
    }
}
