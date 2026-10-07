// Separate process: exclude archive creation and the test runner from memory measurements.
const load = require('./load-typescript.cjs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { verifyEncryptedBackupZip } = load(path.join(__dirname, '../src/modules/backups/backup-zip.ts'));
(async () => {
    let maximum = 0;
    const sample = () => {maximum = Math.max(maximum, process.memoryUsage().arrayBuffers)};
    const timer = setInterval(sample, 2);
    try {
        await verifyEncryptedBackupZip(process.argv[2], 'memory-regression-password');
        sample();
        console.log('Peak array buffers, MiB:', Math.round(maximum / 1048576));
        assert(maximum < 96 * 1048576, 'verification buffered a 128 MiB archive instead of bounded chunks');
    } finally {clearInterval(timer)}
})().catch(error => {console.error(error);process.exitCode=1});
