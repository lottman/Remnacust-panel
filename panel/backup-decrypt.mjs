import { createDecipheriv, scrypt } from 'node:crypto'
import { createReadStream, constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'

const deriveKey = promisify(scrypt)
const magic = Buffer.from('XRBKP002')
const headerLength = 52
const tagLength = 16
const [mode, filename, passwordFile] = process.argv.slice(2)

if (!['verify', 'decrypt'].includes(mode) || !filename || !passwordFile) {
    process.stderr.write('Usage: node backup-decrypt.mjs verify|decrypt FILE.dump.enc PASSWORD_FILE\n')
    process.exit(2)
}

async function main() {
    const secret = await open(passwordFile, constants.O_RDONLY | constants.O_NOFOLLOW)
    let password
    try {
        const info = await secret.stat()
        if (!info.isFile() || (process.platform !== 'win32' && (info.mode & 0o077) !== 0)) {
            throw new Error('Password file must be a regular file with mode 0600')
        }
        password = await secret.readFile()
    } finally {
        await secret.close()
    }
    if (!/^[\x21-\x7e]{16,256}$/.test(password.toString())) {
        password.fill(0)
        throw new Error('Invalid backup password')
    }
    const backup = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW)
    let header
    let tag
    let size
    try {
        const info = await backup.stat()
        size = info.size
        if (!info.isFile() || size < headerLength + tagLength) {
            throw new Error('Invalid encrypted backup')
        }
        header = Buffer.alloc(headerLength)
        tag = Buffer.alloc(tagLength)
        if ((await backup.read(header, 0, headerLength, 0)).bytesRead !== headerLength) {
            throw new Error('Truncated header')
        }
        if ((await backup.read(tag, 0, tagLength, size - tagLength)).bytesRead !== tagLength) {
            throw new Error('Truncated authentication tag')
        }
    } finally {
        await backup.close()
    }
    if (!header.subarray(0, magic.length).equals(magic)) {
        throw new Error('Unsupported backup format')
    }
    const setupSalt = header.subarray(8, 24)
    const fileSalt = header.subarray(24, 40)
    const iv = header.subarray(40, 52)
    const masterKey = await deriveKey(password, setupSalt, 32)
    password.fill(0)
    const key = await deriveKey(masterKey, fileSalt, 32)
    masterKey.fill(0)

    const pass = async (destination) => {
        const decipher = createDecipheriv('aes-256-gcm', key, iv)
        decipher.setAuthTag(tag)
        await pipeline(
            createReadStream(filename, { start: headerLength, end: size - tagLength - 1 }),
            decipher,
            destination,
        )
    }
    try {
        await pass(new Writable({ write(_chunk, _encoding, callback) { callback() } }))
        if (mode === 'decrypt') await pass(process.stdout)
        if (mode === 'verify') process.stderr.write('Backup integrity verified\n')
    } finally {
        key.fill(0)
    }
}

main().catch((error) => {
    process.stderr.write(`Backup recovery failed: ${error.message}\n`)
    process.exitCode = 1
})
