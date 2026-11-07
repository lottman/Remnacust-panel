import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

function integerParameter(url: URL, name: string, fallback: number, minimum: number, maximum: number): number {
    const value = url.searchParams.get(name);
    if (value === null) return fallback;
    if (!/^\d+$/.test(value)) throw new Error(`Invalid database parameter: ${name}`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new Error(`Invalid database parameter: ${name}`);
    }
    return parsed;
}

export function postgresAdapter(databaseUrl = process.env.DATABASE_URL): PrismaPg {
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    let url: URL;
    try { url = new URL(databaseUrl); }
    catch { throw new Error('Invalid DATABASE_URL'); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Invalid database protocol');
    const max = integerParameter(url, 'connection_limit', 10, 1, 256);
    const poolTimeout = integerParameter(url, 'pool_timeout', 10, 0, 300);
    const connectTimeout = integerParameter(url, 'connect_timeout', 5, 1, 300);
    const schema = url.searchParams.get('schema') ?? 'public';
    for (const key of ['connection_limit', 'pool_timeout', 'connect_timeout', 'schema', 'pgbouncer', 'statement_cache_size']) {
        url.searchParams.delete(key);
    }
    return new PrismaPg({
        connectionString: url.toString(),
        max,
        connectionTimeoutMillis: Math.min(poolTimeout || connectTimeout, connectTimeout) * 1_000,
        idleTimeoutMillis: 30_000,
    }, { schema });
}

export function createPrismaClient(databaseUrl?: string): PrismaClient {
    return new PrismaClient({ adapter: postgresAdapter(databaseUrl) });
}
