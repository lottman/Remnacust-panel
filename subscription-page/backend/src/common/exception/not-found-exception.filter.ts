import { ArgumentsHost, Catch, ExceptionFilter, NotFoundException } from '@nestjs/common';

@Catch(NotFoundException)
export class NotFoundExceptionFilter implements ExceptionFilter {
    catch(exception: NotFoundException, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();

        if (!response.destroyed && !response.writableEnded) {
            response.set('Cache-Control', 'private, no-store');
            response.status(404).type('text/plain').send('Not found');
        }

        return;
    }
}
