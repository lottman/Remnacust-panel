import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';

import { ok, TResult } from '@common/types';
import { BACKEND_TOOLS_JWT_ISSUER, BACKEND_TOOLS_JWT_SCOPES } from '@libs/contracts/constants';

import { SignOttTokenCommand } from './sign-ott-token.command';
import type { IJWTAuthPayload } from '@modules/auth/interfaces';

interface IOttTokenPayload {
    scope: string;
    parent: IJWTAuthPayload;
}

@CommandHandler(SignOttTokenCommand)
export class SignOttTokenHandler implements ICommandHandler<SignOttTokenCommand, TResult<string>> {
    constructor(private readonly jwtService: JwtService) {}

    async execute({ parent }: SignOttTokenCommand): Promise<TResult<string>> {
        const payload: IOttTokenPayload = {
            scope: BACKEND_TOOLS_JWT_SCOPES.OTT,
            parent: {
                uuid: parent.uuid, username: parent.username, role: parent.role,
                jti: parent.jti, exp: parent.exp, authVersion: parent.authVersion,
            },
        };

        return ok(
            this.jwtService.sign(payload, {
                expiresIn: '30s',
                jwtid: randomUUID(),
                issuer: BACKEND_TOOLS_JWT_ISSUER,
            }),
        );
    }
}
