import { RawCacheService } from '@common/raw-cache/raw-cache.service';
import { encryptSecret, decryptSecret } from '@common/utils/xera-crypto';
import { CanActivate, ExecutionContext, ForbiddenException, HttpException, Injectable, ServiceUnavailableException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, randomBytes } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { matchesBackupPassword } from './backup-encryption';

const PUBLIC = 'backup-unlock-endpoint';
export const BackupUnlockEndpoint = () => SetMetadata(PUBLIC, true);
export const BACKUP_SESSION_HEADER = 'x-backup-session';
const TTL = 30 * 60_000;
type Session = { encrypted: string; expires: number };
export type BackupRequest = { user: { uuid: string }; headers: Record<string, string | string[] | undefined>; backupPassword?: string };

@Injectable()
export class BackupAccessService {
    private active = 0;
    constructor(private readonly cache: RawCacheService) {}
    async unlock(owner: string, password: unknown, authorization: unknown) {
        const login = this.login(authorization);
        if (this.active >= 4) throw new HttpException('Too many attempts; try again later', 429);
        const attempts = await this.cache.incrementWithTtl(`backup-access:attempts:${owner}`, 60);
        if (attempts > 5 || this.active >= 4) throw new HttpException('Too many attempts; try again later', 429);
        if (typeof password !== 'string' || !/^[\x21-\x7e]{16,256}$/.test(password))
            throw new ForbiddenException('Incorrect backup password');
        this.active++;
        const secret = Buffer.from(password);
        let key: Buffer | undefined;
        try {
            const path = join(process.env.XERA_BACKUPS_DIR ?? join(process.cwd(), 'backups'), '.backup-key');
            try {
                const info = await lstat(path);
                if (!info.isFile() || info.size !== 48) throw new Error('Invalid key');
                key = await readFile(path);
            } catch { throw new ServiceUnavailableException('Backup verification key is unavailable'); }
            if (!(await matchesBackupPassword(secret, key))) throw new ForbiddenException('Incorrect backup password');
            const token = randomBytes(32).toString('hex');
            const expires = Date.now() + TTL;
            await this.cache.set(this.key(owner, token, login), { encrypted: encryptSecret(JSON.stringify({ password })), expires }, TTL / 1000);
            return { token, expiresAt: expires };
        } finally {
            this.active--;
            secret.fill(0);
            key?.fill(0);
        }
    }
    private login(authorization: unknown): string {
        if (typeof authorization !== 'string' || !/^Bearer\s+\S+$/i.test(authorization))
            throw new ForbiddenException('Backup page is locked');
        return createHash('sha256').update(authorization.trim().split(/\s+/)[1]).digest('hex');
    }
    private key(owner: string, token: string, login: string) {
        return `backup-access:session:${owner}:${login}:${createHash('sha256').update(token).digest('hex')}`;
    }
    async password(owner: string, token: unknown, authorization: unknown): Promise<string> {
        if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new ForbiddenException('Backup page is locked');
        const session = await this.cache.get<Session>(this.key(owner, token, this.login(authorization)));
        if (!session || session.expires <= Date.now()) throw new ForbiddenException('Backup page is locked');
        try {
            const data = JSON.parse(decryptSecret(session.encrypted)) as { password: string };
            if (typeof data.password !== 'string' || !/^[\x21-\x7e]{16,256}$/.test(data.password)) throw new Error('Invalid session');
            return data.password;
        } catch { throw new ForbiddenException('Backup page is locked'); }
    }
    async revoke(owner: string, token: unknown, authorization: unknown) {
        if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return;
        await this.cache.del(this.key(owner, token, this.login(authorization)));
    }

}

@Injectable()
export class BackupAccessGuard implements CanActivate {
    constructor(private readonly access: BackupAccessService, private readonly reflector: Reflector) {}
    async canActivate(context: ExecutionContext) {
        context.switchToHttp().getResponse().setHeader('Cache-Control', 'no-store');
        if (this.reflector.get<boolean>(PUBLIC, context.getHandler())) return true;
        const request = context.switchToHttp().getRequest<BackupRequest>();
        request.backupPassword = await this.access.password(request.user.uuid, request.headers[BACKUP_SESSION_HEADER], request.headers.authorization);
        return true;
    }
}
