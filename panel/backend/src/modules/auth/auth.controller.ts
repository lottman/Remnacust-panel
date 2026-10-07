import { Body, Controller, HttpStatus, UseFilters, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Endpoint } from '@common/decorators/base-endpoint';
import { IpAddress } from '@common/decorators/get-ip/get-ip';
import { GetRemnawaveSettings } from '@common/decorators/get-remnawave-settings';
import { UserAgent } from '@common/decorators/get-useragent/get-useragent';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { errorHandler } from '@common/helpers/error-handler.helper';
import { CONTROLLERS_INFO } from '@libs/contracts/api';
import { AUTH_CONTROLLER } from '@libs/contracts/api/controllers/auth';
import {
    GetStatusCommand,
    LoginCommand,
    RegisterCommand,
    OAuth2AuthorizeCommand,
    OAuth2CallbackCommand,
    GetPasskeyAuthenticationOptionsCommand,
    VerifyPasskeyAuthenticationCommand,
} from '@libs/contracts/commands';

import { RemnawaveSettingsEntity } from '@modules/remnawave-settings/entities';

import { AuthService } from './auth.service';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import {
    GetStatusResponseDto,
    LoginBodyDto,
    LoginResponseDto,
    RegisterBodyDto,
    RegisterResponseDto,
    OAuth2AuthorizeResponseDto,
    OAuth2CallbackResponseDto,
    OAuth2CallbackBodyDto,
    OAuth2AuthorizeBodyDto,
    GetPasskeyAuthenticationOptionsResponseDto,
    VerifyPasskeyAuthenticationBodyDto,
    VerifyPasskeyAuthenticationResponseDto,
} from './dtos';
import { AuthResponseModel } from './model/auth-response.model';
import { RegisterResponseModel } from './model/register.response.model';

@ApiTags(CONTROLLERS_INFO.AUTH.tag)
@UseFilters(HttpExceptionFilter)
@UseGuards(AuthRateLimitGuard)
@Controller(AUTH_CONTROLLER)
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Endpoint({
        command: LoginCommand,
        httpCode: HttpStatus.OK,
        type: LoginResponseDto,
    })
    async login(
        @Body() body: LoginBodyDto,
        @IpAddress() ip: string,
        @UserAgent() userAgent: string,
    ): Promise<LoginResponseDto> {
        const result = await this.authService.login(body, ip, userAgent);

        const data = errorHandler(result);
        return {
            response: new AuthResponseModel(data),
        };
    }

    @Endpoint({
        command: RegisterCommand,
        httpCode: HttpStatus.CREATED,
        type: RegisterResponseDto,
    })
    async register(@Body() body: RegisterBodyDto): Promise<RegisterResponseDto> {
        const result = await this.authService.register(body);

        const data = errorHandler(result);
        return {
            response: new RegisterResponseModel(data),
        };
    }

    @Endpoint({
        command: GetStatusCommand,
        httpCode: HttpStatus.OK,
        type: GetStatusResponseDto,
    })
    async getStatus(): Promise<GetStatusResponseDto> {
        const result = await this.authService.getStatus();

        const data = errorHandler(result);
        return {
            response: data,
        };
    }

    @Endpoint({
        command: OAuth2AuthorizeCommand,
        httpCode: HttpStatus.OK,
        type: OAuth2AuthorizeResponseDto,
    })
    async oauth2Authorize(
        @Body() body: OAuth2AuthorizeBodyDto,
    ): Promise<OAuth2AuthorizeResponseDto> {
        const result = await this.authService.oauth2Authorize(body.provider);

        const data = errorHandler(result);
        return {
            response: data,
        };
    }

    @Endpoint({
        command: OAuth2CallbackCommand,
        httpCode: HttpStatus.OK,
        type: OAuth2CallbackResponseDto,
    })
    async oauth2Callback(
        @Body() body: OAuth2CallbackBodyDto,
        @IpAddress() ip: string,
        @UserAgent() userAgent: string,
    ): Promise<OAuth2CallbackResponseDto> {
        const result = await this.authService.oauth2Callback(
            body.code,
            body.state,
            body.provider,
            ip,
            userAgent,
        );

        const data = errorHandler(result);
        return {
            response: data,
        };
    }

    @Endpoint({
        command: GetPasskeyAuthenticationOptionsCommand,
        httpCode: HttpStatus.OK,
        type: GetPasskeyAuthenticationOptionsResponseDto,
    })
    async passkeyAuthenticationOptions(
        @GetRemnawaveSettings() remnawaveSettings: RemnawaveSettingsEntity,
    ): Promise<GetPasskeyAuthenticationOptionsResponseDto> {
        const result =
            await this.authService.generatePasskeyAuthenticationOptions(remnawaveSettings);

        const data = errorHandler(result);
        return {
            response: data,
        };
    }

    @Endpoint({
        command: VerifyPasskeyAuthenticationCommand,
        httpCode: HttpStatus.OK,
        type: VerifyPasskeyAuthenticationResponseDto,
    })
    async passkeyAuthenticationVerify(
        @Body() body: VerifyPasskeyAuthenticationBodyDto,
        @GetRemnawaveSettings() remnawaveSettings: RemnawaveSettingsEntity,
        @IpAddress() ip: string,
        @UserAgent() userAgent: string,
    ): Promise<VerifyPasskeyAuthenticationResponseDto> {
        const result = await this.authService.verifyPasskeyAuthentication(
            body,
            remnawaveSettings,
            ip,
            userAgent,
        );

        const data = errorHandler(result);
        return {
            response: data,
        };
    }
}
