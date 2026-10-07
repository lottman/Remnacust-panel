import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const IpAddress = createParamDecorator((data, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.clientIp;
});
