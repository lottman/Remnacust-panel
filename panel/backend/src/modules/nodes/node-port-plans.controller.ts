import { ROLE } from '@contract/constants';
import { z } from 'zod';

import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Post,
    UseFilters,
    UseGuards,
} from '@nestjs/common';

import { AdminOnlyEndpoint } from '@common/decorators/admin-only-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { HttpExceptionWithErrorCodeType } from '@common/exception/http-exeception-with-error-code.type';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles/roles.guard';
import { ScopesGuard } from '@common/guards/scopes';

import { NodePortPlanInputSchema, PortPlanRevisionSchema } from './node-port-plans.schema';
import { NodePortPlansService, PortPlanEditError } from './node-port-plans.service';
import { PortPlanError } from './profile-port-plan';

@Controller('nodes/:uuid/ports')
@Roles(ROLE.ADMIN)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@UseFilters(HttpExceptionFilter)
export class NodePortPlansController {
    constructor(private readonly plans: NodePortPlansService) {}
    private async handle<T>(action: () => Promise<T>) {
        try {
            return { response: await action() };
        } catch (error) {
            if (error instanceof z.ZodError)
                throw new HttpExceptionWithErrorCodeType(
                    'Invalid port-plan request',
                    'PORT_PLAN_INVALID_REQUEST',
                    400,
                );
            if (error instanceof PortPlanEditError)
                throw new HttpExceptionWithErrorCodeType(
                    error.code,
                    'PORT_PLAN_' + error.code,
                    ['NODE_MISSING', 'HISTORY_MISSING'].includes(error.code) ? 404 : 409,
                );
            if (error instanceof PortPlanError)
                throw new HttpExceptionWithErrorCodeType(
                    error.message,
                    'PORT_PLAN_' + error.code,
                    [
                        'LISTENER_CONFLICT',
                        'RESERVED_LISTENER',
                        'DUPLICATE_BINDING',
                        'DUPLICATE_INBOUND',
                    ].includes(error.code)
                        ? 409
                        : 422,
                );
            throw error;
        }
    }
    @AdminOnlyEndpoint()
    @Get()
    get(@Param('uuid', new ParseUUIDPipe()) uuid: string) {
        return this.handle(() => this.plans.get(uuid));
    }
    @AdminOnlyEndpoint()
    @Post('apply')
    @HttpCode(200)
    apply(@Param('uuid', new ParseUUIDPipe()) uuid: string, @Body() body: unknown) {
        return this.handle(() => {
            const input = NodePortPlanInputSchema.parse(body);
            if (!input.reviewHash)
                throw new HttpExceptionWithErrorCodeType(
                    'Review is required',
                    'PORT_PLAN_REVIEW_REQUIRED',
                    409,
                );
            return this.plans.save(uuid, input);
        });
    }
    @AdminOnlyEndpoint()
    @Post('preview')
    @HttpCode(200)
    preview(@Param('uuid', new ParseUUIDPipe()) uuid: string, @Body() body: unknown) {
        return this.handle(() => this.plans.preview(uuid, body));
    }
    @AdminOnlyEndpoint()
    @Post()
    @HttpCode(200)
    save(@Param('uuid', new ParseUUIDPipe()) uuid: string, @Body() body: unknown) {
        return this.handle(() => this.plans.save(uuid, body));
    }
    @AdminOnlyEndpoint()
    @Get('history')
    history(@Param('uuid', new ParseUUIDPipe()) uuid: string) {
        return this.handle(() => this.plans.history(uuid));
    }
    @AdminOnlyEndpoint()
    @Post('history/:revision/restore')
    @HttpCode(200)
    restore(
        @Param('uuid', new ParseUUIDPipe()) uuid: string,
        @Param('revision', new ParseUUIDPipe()) revision: string,
        @Body() body: unknown,
    ) {
        return this.handle(() => {
            const input = z
                .strictObject({
                    expectedRevision: PortPlanRevisionSchema,
                    requestId: z.uuid().optional(),
                })
                .parse(body);
            return this.plans.restore(uuid, revision, input.expectedRevision, input.requestId);
        });
    }
    @AdminOnlyEndpoint()
    @Post('retry')
    @HttpCode(200)
    retry(@Param('uuid', new ParseUUIDPipe()) uuid: string, @Body() body: unknown) {
        return this.handle(() => {
            const input = z.strictObject({ expectedRevision: PortPlanRevisionSchema }).parse(body);
            return this.plans.retry(uuid, input.expectedRevision);
        });
    }
}
