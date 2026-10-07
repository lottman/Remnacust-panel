import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetOptionalAuth = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.authenticatedFromBrowser ?? false;
});
