import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PANEL_ONLY_ENDPOINT } from '@common/decorators/admin-only-endpoint';

import { HttpExceptionWithErrorCodeType } from '@common/exception/http-exeception-with-error-code.type';
import { ERRORS, ROLE, TRolesKeys } from '@libs/contracts/constants';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<TRolesKeys[]>(ROLE, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!requiredRoles) {
            return true;
        }

        const { user } = context.switchToHttp().getRequest();

        const panelOnly = this.reflector.getAllAndOverride<boolean>(PANEL_ONLY_ENDPOINT, [
            context.getHandler(), context.getClass(),
        ]) === true;
        const hasRole = (!panelOnly || user?.role === ROLE.ADMIN) && requiredRoles.includes(user?.role);

        if (!hasRole) {
            throw new HttpExceptionWithErrorCodeType(
                ERRORS.FORBIDDEN_ROLE_ERROR.message,
                ERRORS.FORBIDDEN_ROLE_ERROR.code,
                ERRORS.FORBIDDEN_ROLE_ERROR.httpCode,
            );
        }
        return hasRole;
    }
}
