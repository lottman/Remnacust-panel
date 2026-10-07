import 'dotenv/config';
import type { PrismaConfig } from 'prisma';

import path from 'node:path';

if (!process.env.DIRECT_URL) {
    // eslint-disable-next-line no-console
    console.log('DIRECT_URL is not set, using DATABASE_URL');
    process.env.DIRECT_URL = process.env.DATABASE_URL;
} else {
    // eslint-disable-next-line no-console
    console.log('DIRECT_URL is set, using DIRECT_URL');
}

export default {
    schema: path.join('prisma', 'schema.prisma'),
    migrations: {
        path: path.join('prisma', 'migrations'),
        seed: 'node dist/seed.js',
    },
} satisfies PrismaConfig;
