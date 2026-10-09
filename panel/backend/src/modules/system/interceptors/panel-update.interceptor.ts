import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';

import { HttpExceptionWithErrorCodeType } from '@common/exception/http-exeception-with-error-code.type';
import { ROLE } from '@libs/contracts/constants';

import { PanelUpdateService } from '../panel-update.service';

@Injectable()
export class PanelUpdateInterceptor implements NestInterceptor {
    constructor(private readonly updates: PanelUpdateService) {}
    async intercept(context: ExecutionContext, next: CallHandler) {
        if (context.getType() !== 'http') return next.handle();
        const req = context.switchToHttp().getRequest();
        const path = req.path.toLowerCase().replace(/\/+$/, '');
        if (
            req.user?.role === ROLE.ADMIN &&
            ![
                '/api/system/update/status',
                '/api/system/update/start',
                '/api/system/metadata',
            ].includes(path)
        ) {
            if (await this.updates.isActive())
                throw new HttpExceptionWithErrorCodeType('PANEL_UPDATING', 'PANEL_UPDATING', 503);
        }
        return next.handle();
    }
}
