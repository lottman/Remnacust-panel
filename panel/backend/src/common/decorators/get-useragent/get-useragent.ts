import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { truncateHeader } from '@common/utils/truncate-header.util';

export const UserAgent = createParamDecorator((data, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();

    return truncateHeader(request.headers['user-agent']) ?? 'Unknown';
});
