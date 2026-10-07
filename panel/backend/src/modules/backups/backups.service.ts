import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import FormData from 'form-data';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, type ReadStream } from 'node:fs';
import { chmod, lstat, mkdir, readdir, rename, stat, unlink, utimes } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';

import { fail, ok, TResult } from '@common/types';
import { decryptSecret, isXeraEnvelope } from '@common/utils/xera-crypto';
import { ERRORS } from '@libs/contracts/constants';
import { BackupSettingsSchema, TBackupFile, TBackupSettings } from '@libs/contracts/models';

import { verifyEncryptedBackupZip, writeEncryptedBackupZip } from './backup-zip';

const BACKUP_NAME_RE = /^[A-Za-z0-9._-]+\.(?:zip|dump(?:\.enc)?)$/;
const ZIP_BACKUP_RE = /^[A-Za-z0-9._-]+\.zip$/;
const LEGACY_ENCRYPTED_RE = /^[A-Za-z0-9._-]+\.dump\.enc$/;
export const DEFAULT_BACKUP_RETENTION_DAYS = 7;
const PASSWORD_RE = /^[\x21-\x7e]{16,256}$/;

@Injectable()
export class BackupsService {
    private readonly logger = new Logger(BackupsService.name);
    private readonly backupsDir: string;
    private readonly plainDir: string;

    constructor(private readonly prisma: TransactionHost<TransactionalAdapterPrisma>) {
        this.backupsDir = process.env.XERA_BACKUPS_DIR ?? join(process.cwd(), 'backups');
        this.plainDir = process.env.XERA_PLAIN_DUMPS_DIR ?? join(process.cwd(), 'plain-dumps');
    }

    private async ensureDir(): Promise<void> {
        if (!existsSync(this.backupsDir)) {
            await mkdir(this.backupsDir, { recursive: true, mode: 0o700 });
        }
        await chmod(this.backupsDir, 0o700);
    }

    private async ensurePlainDir(): Promise<void> {
        if (!existsSync(this.plainDir)) {
            throw new Error('Plain dump directory is not mounted');
        }
        const info = await lstat(this.plainDir);
        if (!info.isDirectory()) throw new Error('Plain dump directory is not a regular directory');
        await chmod(this.plainDir, 0o700);
    }

    private readBackupPassword(): string {
        const encrypted = process.env.XERA_BACKUP_PASSWORD_ENC;
        if (!encrypted || !isXeraEnvelope(encrypted)) {
            throw new Error('Encrypted backup password is missing from the panel environment');
        }
        const password = decryptSecret(encrypted);
        if (password === encrypted || !PASSWORD_RE.test(password)) {
            throw new Error('Could not decrypt the configured backup password');
        }
        return password;
    }

    public async encryptionStatus(): Promise<{ configured: boolean; legacyCount: number }> {
        await this.ensureDir();
        const names = await readdir(this.backupsDir);
        let configured = false;
        try {
            this.readBackupPassword();
            configured = true;
        } catch {
            configured = false;
        }
        return {
            configured,
            legacyCount: names.filter((name) => name.endsWith('.dump') && BACKUP_NAME_RE.test(name))
                .length,
        };
    }

    public async migrateLegacy(
        manualPassword?: string,
    ): Promise<{ configured: boolean; legacyCount: number }> {
        await this.ensureDir();
        const password = manualPassword ?? this.readBackupPassword();
        for (const filename of (await readdir(this.backupsDir)).filter(
            (name) => name.endsWith('.dump') && BACKUP_NAME_RE.test(name),
        )) {
            const legacy = join(this.backupsDir, filename);
            const encrypted = `${legacy.slice(0, -'.dump'.length)}.zip`;
            const temporary = `${encrypted}.${randomUUID()}.partial`;
            if (existsSync(encrypted)) continue;
            try {
                const info = await lstat(legacy);
                if (!info.isFile()) throw new Error('Legacy backup is not a regular file');
                const restore = spawn('pg_restore', ['--list', legacy], {
                    stdio: 'ignore',
                    timeout: 60_000,
                    killSignal: 'SIGKILL',
                });
                await new Promise<void>((resolve, reject) => {
                    restore.once('error', reject);
                    restore.once('close', (code) =>
                        code === 0 ? resolve() : reject(new Error('Invalid PostgreSQL dump')),
                    );
                });
                await writeEncryptedBackupZip(createReadStream(legacy), temporary, password);
                await verifyEncryptedBackupZip(temporary, password);
                await rename(temporary, encrypted);
                await utimes(encrypted, info.atime, info.mtime);
                await unlink(legacy);
            } catch (error) {
                await unlink(temporary).catch(() => undefined);
                this.logger.warn(`Could not encrypt legacy backup ${filename}: ${error}`);
            }
        }
        return this.encryptionStatus();
    }

    public async list(): Promise<TResult<TBackupFile[]>> {
        try {
            await this.ensureDir();
            if (existsSync(this.plainDir)) await this.ensurePlainDir();
            const names = await readdir(this.backupsDir);
            const backups: TBackupFile[] = [];
            for (const name of names.filter((n) => BACKUP_NAME_RE.test(n))) {
                const info = await this.backupStat(join(this.backupsDir, name));
                if (!info?.isFile()) continue;
                backups.push({
                    filename: name,
                    sizeBytes: info.size,
                    createdAt: info.mtime,
                });
            }
            if (existsSync(this.plainDir)) {
                for (const name of (await readdir(this.plainDir)).filter((n) =>
                    /^manual-[A-Za-z0-9._-]+\.dump$/.test(n),
                )) {
                    const info = await this.backupStat(join(this.plainDir, name));
                    if (!info?.isFile()) continue;
                    backups.push({ filename: name, sizeBytes: info.size, createdAt: info.mtime });
                }
            }
            backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            return ok(backups);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }

    private async backupStat(path: string) {
        try {
            return await lstat(path);
        } catch (error) {
            // Retention or another API worker may delete an entry after readdir.
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw error;
        }
    }

    public async create(
        sendToTelegram = false,
        manualPassword?: string,
    ): Promise<TResult<TBackupFile>> {
        try {
            await this.ensureDir();
            const settings = await this.readSettings();
            const databaseUrl = process.env.DATABASE_URL;
            if (!databaseUrl) {
                return fail(ERRORS.INTERNAL_SERVER_ERROR);
            }
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `remnawave-${sendToTelegram ? 'scheduled' : 'manual'}-${stamp}-${randomUUID()}.zip`;
            const target = join(this.backupsDir, filename);
            const temporary = `${target}.partial`;
            const backupPassword = manualPassword ?? this.readBackupPassword();
            const connection = new URL(databaseUrl);
            const password =
                connection.searchParams.get('password') ?? decodeURIComponent(connection.password);
            connection.password = '';
            for (const parameter of [
                'password',
                'schema',
                'connection_limit',
                'pool_timeout',
                'pgbouncer',
            ])
                connection.searchParams.delete(parameter);
            const dumpProcess = spawn(
                'pg_dump',
                ['--format=custom', '--compress=6', `--dbname=${connection}`],
                {
                    env: { ...process.env, PGPASSWORD: password },
                    stdio: ['ignore', 'pipe', 'pipe'],
                    timeout: 15 * 60_000,
                    killSignal: 'SIGKILL',
                },
            );
            let errorOutput = '';
            dumpProcess.stderr.on('data', (chunk: Buffer) => {
                errorOutput = (errorOutput + chunk.toString()).slice(-2048);
            });
            const completed = new Promise<void>((resolve, reject) => {
                dumpProcess.once('error', reject);
                dumpProcess.once('close', (code) =>
                    code === 0
                        ? resolve()
                        : reject(new Error(`pg_dump failed (${code}): ${errorOutput}`)),
                );
            });
            const writing = writeEncryptedBackupZip(dumpProcess.stdout, temporary, backupPassword);
            try {
                await Promise.all([writing, completed]);
                await verifyEncryptedBackupZip(temporary, backupPassword);
                await rename(temporary, target);
            } catch (error) {
                dumpProcess.kill('SIGKILL');
                dumpProcess.stdout.destroy(new Error('Backup creation aborted'));
                await Promise.allSettled([writing, completed]);
                await unlink(temporary).catch(() => undefined);
                throw error;
            }
            const info = await stat(target);
            const backup: TBackupFile = { filename, sizeBytes: info.size, createdAt: info.mtime };
            await this.prune(settings.retentionDays);

            if (sendToTelegram && settings.sendToTelegram) {
                await this.deliver(filename, settings);
            }
            return ok(backup);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }

    public async remove(filename: string): Promise<TResult<TBackupFile[]>> {
        try {
            if (!BACKUP_NAME_RE.test(filename)) {
                return fail(ERRORS.INTERNAL_SERVER_ERROR);
            }
            const plainTarget = join(this.plainDir, filename);
            const target =
                filename.startsWith('manual-') &&
                filename.endsWith('.dump') &&
                existsSync(plainTarget)
                    ? plainTarget
                    : join(this.backupsDir, filename);
            if (existsSync(target)) {
                await unlink(target);
            }
            const list = await this.list();
            return list.isOk ? ok(list.response) : fail(ERRORS.INTERNAL_SERVER_ERROR);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }

    public async download(filename: string): Promise<ReadStream | null> {
        if (
            !ZIP_BACKUP_RE.test(filename) &&
            !LEGACY_ENCRYPTED_RE.test(filename) &&
            !/^manual-[A-Za-z0-9._-]+\.dump$/.test(filename)
        )
            return null;
        const path = join(
            ZIP_BACKUP_RE.test(filename) || LEGACY_ENCRYPTED_RE.test(filename)
                ? this.backupsDir
                : this.plainDir,
            filename,
        );
        const info = await lstat(path).catch(() => null);
        if (!info?.isFile()) return null;
        return createReadStream(path);
    }

    public async send(filename: string): Promise<TResult<{ delivered: boolean }>> {
        try {
            if (!ZIP_BACKUP_RE.test(filename) && !LEGACY_ENCRYPTED_RE.test(filename)) {
                return fail(ERRORS.INTERNAL_SERVER_ERROR);
            }
            const settings = await this.readSettings();
            if (!settings.telegramBotToken || !settings.telegramChatId) {
                return ok({ delivered: false });
            }
            const delivered = await this.deliver(filename, settings);
            return ok({ delivered });
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }

    private async deliver(filename: string, settings: TBackupSettings): Promise<boolean> {
        if (!settings.telegramBotToken || !settings.telegramChatId) return false;
        if (!ZIP_BACKUP_RE.test(filename) && !LEGACY_ENCRYPTED_RE.test(filename)) return false;
        const target = join(this.backupsDir, filename);
        if (!existsSync(target)) return false;
        const info = await lstat(target);
        if (!info.isFile()) return false;
        const form = new FormData();
        form.append('chat_id', settings.telegramChatId);
        form.append('caption', `Remnawave backup ${filename}`);
        form.append('document', createReadStream(target), {
            filename,
            contentType: 'application/octet-stream',
            knownLength: info.size,
        });
        try {
            const response = await axios.post(
                `https://api.telegram.org/bot${settings.telegramBotToken}/sendDocument`,
                form,
                { headers: form.getHeaders(), maxBodyLength: Infinity, timeout: 120_000 },
            );
            return response.status === 200 && response.data?.ok === true;
        } catch {
            this.logger.warn('Encrypted backup delivery failed');
            return false;
        }
    }

    public async cleanup(): Promise<void> {
        const settings = await this.readSettings();
        await this.prune(settings.retentionDays);
    }

    private async prune(retentionDays: number): Promise<void> {
        const days = Number.isInteger(retentionDays)
            ? Math.min(DEFAULT_BACKUP_RETENTION_DAYS, Math.max(1, retentionDays))
            : DEFAULT_BACKUP_RETENTION_DAYS;
        const cutoff = Date.now() - days * 86_400_000;
        const list = await this.list();
        if (!list.isOk) return;
        for (const item of list.response) {
            if (item.createdAt.getTime() > cutoff) continue;
            const plain = /^manual-[A-Za-z0-9._-]+\.dump$/.test(item.filename);
            const path = join(
                plain && existsSync(join(this.plainDir, item.filename))
                    ? this.plainDir
                    : this.backupsDir,
                item.filename,
            );
            try {
                if ((await lstat(path)).isFile()) await unlink(path);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                    this.logger.warn(`Failed to prune backup ${item.filename}`);
            }
        }
    }

    public async readSettings(): Promise<TBackupSettings> {
        const row = await this.prisma.tx.remnawaveSettings.findUnique({ where: { id: 1 } });
        const saved = (row?.backupSettings ?? {}) as Record<string, unknown>;
        const parsed = BackupSettingsSchema.safeParse({
            ...saved,
            intervalHours: saved.intervalHours ?? (saved.autoMode === 'WEEKLY' ? 168 : 24),
        });
        return parsed.success ? parsed.data : BackupSettingsSchema.parse({});
    }

    public async getSettings(): Promise<TResult<TBackupSettings>> {
        try {
            return ok(await this.readSettings());
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }

    public async updateSettings(dto: Partial<TBackupSettings>): Promise<TResult<TBackupSettings>> {
        try {
            const current = await this.readSettings();
            const next = BackupSettingsSchema.parse({ ...current, ...dto });
            await this.prisma.tx.remnawaveSettings.upsert({
                where: { id: 1 },
                create: { backupSettings: next as unknown as Prisma.InputJsonValue },
                update: { backupSettings: next as unknown as Prisma.InputJsonValue },
            });
            return ok(next);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}
