import { Body, Controller, HttpStatus, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Endpoint } from '@common/decorators/base-endpoint';
import { GetJWTPayload } from '@common/decorators/get-jwt-payload';
import { Roles } from '@common/decorators/roles';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles/roles.guard';
import { errorHandler } from '@common/helpers/error-handler.helper';
import { CONTROLLERS_INFO, PASSKEYS_CONTROLLER } from '@libs/contracts/api';
import {
    GetPasskeyRegistrationOptionsCommand,
    VerifyPasskeyRegistrationCommand,
    DeletePasskeyCommand,
    GetPasskeysCommand,
    UpdatePasskeyCommand,
} from '@libs/contracts/commands';
import { ROLE } from '@libs/contracts/constants';

import type { IJWTAuthPayload } from '@modules/auth/interfaces';

import {
    DeletePasskeyBodyDto,
    GetPasskeyRegistrationOptionsResponseDto,
    GetPasskeysResponseDto,
    UpdatePasskeyBodyDto,
    UpdatePasskeyResponseDto,
    VerifyPasskeyRegistrationBodyDto,
    VerifyPasskeyRegistrationResponseDto,
} from '../dtos';
import { PasskeyService } from '../services/passkey.service';

@ApiBearerAuth('Authorization')
@ApiTags(CONTROLLERS_INFO.PASSKEYS.tag)
@Roles(ROLE.ADMIN)
@UseGuards(JwtDefaultGuard, RolesGuard)
@UseFilters(HttpExceptionFilter)
@Controller(PASSKEYS_CONTROLLER)
export class PasskeyController {
    constructor(private readonly passkeyService: PasskeyService) {}

    @Endpoint({
        command: GetPasskeyRegistrationOptionsCommand,
        httpCode: HttpStatus.OK,
        type: GetPasskeyRegistrationOptionsResponseDto,
    })
    async passkeyRegistrationOptions(
        @GetJWTPayload() payload: IJWTAuthPayload,
    ): Promise<GetPasskeyRegistrationOptionsResponseDto> {
        const result = await this.passkeyService.generatePasskeyRegistrationOptions(payload);

        const data = errorHandler(result);
        return {
            response: data,
        };
    }

    @Endpoint({
        command: VerifyPasskeyRegistrationCommand,
        httpCode: HttpStatus.OK,
        type: VerifyPasskeyRegistrationResponseDto,
    })
    async passkeyRegistrationVerify(
        @Body() body: VerifyPasskeyRegistrationBodyDto,
        @GetJWTPayload() payload: IJWTAuthPayload,
    ): Promise<VerifyPasskeyRegistrationResponseDto> {
        const result = await this.passkeyService.verifyPasskeyRegistration(payload, body);

        const data = errorHandler(result);
        return {
            response: data,
        };
    }

    @Endpoint({
        command: GetPasskeysCommand,
        httpCode: HttpStatus.OK,
        type: GetPasskeysResponseDto,
    })
    async getActivePasskeys(
        @GetJWTPayload() payload: IJWTAuthPayload,
    ): Promise<GetPasskeysResponseDto> {
        const result = await this.passkeyService.getActivePasskeys(payload);

        const data = errorHandler(result);
        return {
            response: data,
        };
    }

    @Endpoint({
        command: DeletePasskeyCommand,
        httpCode: HttpStatus.NO_CONTENT,
    })
    async deletePasskey(
        @Body() body: DeletePasskeyBodyDto,
        @GetJWTPayload() payload: IJWTAuthPayload,
    ) {
        const result = await this.passkeyService.deletePasskey(payload, body.id);

        errorHandler(result);
        return;
    }

    @Endpoint({
        command: UpdatePasskeyCommand,
        httpCode: HttpStatus.OK,
        type: UpdatePasskeyResponseDto,
    })
    async updatePasskey(
        @Body() body: UpdatePasskeyBodyDto,
        @GetJWTPayload() payload: IJWTAuthPayload,
    ): Promise<UpdatePasskeyResponseDto> {
        const result = await this.passkeyService.updatePasskey(payload, body);

        const data = errorHandler(result);
        return {
            response: data,
        };
    }
}
