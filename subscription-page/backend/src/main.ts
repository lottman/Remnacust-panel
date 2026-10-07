process.title = 'rw-subpage';

import cookieParser from 'cookie-parser';
import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { dynamicRequestBudget } from '@common/middlewares/request-budget.middleware';
import morgan from 'morgan';
import { utilities as nestWinstonModuleUtilities, WinstonModule } from 'nest-winston';
import path from 'node:path';
import sirv from 'sirv';
import { createLogger } from 'winston';
import * as winston from 'winston';

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

import { APP_CONFIG_ROUTE_WO_LEADING_PATH } from '@remnawave/subscription-page-types';

import { TypedConfigService } from '@common/config/app-config';
import { NotFoundExceptionFilter } from '@common/exception/not-found-exception.filter';
import {
    headerFilterMiddleware,
    noRobotsMiddleware,
    proxyCheckMiddleware,
    checkAssetsCookieMiddleware,
    getRealIp,
} from '@common/middlewares';
import { customLogFilter } from '@common/utils/filter-logs/filter-logs';
import { getAssetsPath, isDevelopment, isDevOrDebugLogsEnabled } from '@common/utils/startup-app';
import { getStartMessage } from '@common/utils/startup-app/get-start-message';

import { AppModule } from './app.module';

// const levels = {
//     error: 0,
//     warn: 1,
//     info: 2,
//     http: 3,
//     verbose: 4,
//     debug: 5,
//     silly: 6,
// };

const instanceId = process.env.INSTANCE_ID || '0';

const logger = createLogger({
    transports: [new winston.transports.Console()],
    format: winston.format.combine(
        customLogFilter(),
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss.SSS',
        }),
        winston.format.ms(),
        nestWinstonModuleUtilities.format.nestLike(`${instanceId}`, {
            colors: true,
            prettyPrint: true,
            processId: false,
            appName: true,
        }),
    ),
    level: isDevOrDebugLogsEnabled() ? 'debug' : 'http',
});

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        logger: WinstonModule.createLogger({
            instance: logger,
        }),
    });

    const config = app.get(TypedConfigService);

    app.set('etag', false);
    app.disable('x-powered-by');
    app.use(compression({ threshold: 1024 }));
    app.use(dynamicRequestBudget());

    app.set('trust proxy', config.getOrThrow('TRUST_PROXY'));

    app.use('/internal/health', (req: Request, res: Response, next: NextFunction) => {
        const ip = req.socket.remoteAddress ?? '';
        const isLoopback = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';

        if (isLoopback && !req.headers['x-forwarded-for'] && req.path === '/') {
            res.status(200).type('text/plain').send('OK');
            return;
        }

        next();
    });

    if (!isDevelopment()) {
        app.use(proxyCheckMiddleware);
    }

    app.use('/assets', cookieParser());
    app.use('/assets', checkAssetsCookieMiddleware);

    // Only hashed static assets may be cached; account pages contain credentials.
    app.use((req: Request, res: Response, next: NextFunction) => {
        if (!req.path.startsWith('/assets/') || req.path === `/${APP_CONFIG_ROUTE_WO_LEADING_PATH}`) {
            res.set('Cache-Control', 'private, no-store');
            res.set('Referrer-Policy', 'no-referrer');
        }
        next();
    });
    app.use(noRobotsMiddleware, getRealIp, headerFilterMiddleware);

    app.use(
        '/assets',
        sirv(path.join(getAssetsPath(), 'assets'), {
            maxAge: 604800, // 7 days
            immutable: true,
            etag: false,
            // dev: isDevelopment(),
        }),
    );

    app.use(helmet({ contentSecurityPolicy: false }));

    morgan.token('safe-route', (req) => {
        const pathname = req.url?.split('?', 1)[0] ?? '';
        return pathname.startsWith('/assets/') ? '/assets' : '/subscription';
    });
    app.use(
        morgan(
            ':remote-addr - ":method :safe-route HTTP/:http-version" :status :res[content-length]',
            {
                skip: (req) => req?.url?.startsWith('/assets') ?? false,
            },
        ),
    );

    const customSubPrefix = config.get('CUSTOM_SUB_PREFIX');

    app.setGlobalPrefix(customSubPrefix ?? '', { exclude: [APP_CONFIG_ROUTE_WO_LEADING_PATH] });

    if (customSubPrefix) {
        logger.info('[CONFIG] CUSTOM_SUB_PREFIX: ' + customSubPrefix);
    } else {
        logger.info('[CONFIG] CUSTOM_SUB_PREFIX: not set');
    }

    app.useGlobalFilters(new NotFoundExceptionFilter());

    app.enableCors({
        origin: '*',
        methods: 'GET',
        credentials: false,
    });

    app.enableShutdownHooks();

    await app.listen(Number(config.getOrThrow('APP_PORT')));

    logger.info('\n' + (await getStartMessage()) + '\n');

    if (import.meta.webpackHot) {
        import.meta.webpackHot.accept();
        import.meta.webpackHot.dispose(() => app.close());
    }
}
void bootstrap();
