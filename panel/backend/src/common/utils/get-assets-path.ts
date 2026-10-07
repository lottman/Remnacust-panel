import path from 'node:path';

import { isDevelopment } from './startup-app';

export function getAssetsPath(): string {
    return isDevelopment() ? path.resolve(process.cwd(), 'frontend') : '/opt/app/frontend';
}
