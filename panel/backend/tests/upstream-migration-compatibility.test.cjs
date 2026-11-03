const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const fixture = require('./fixtures/upstream-migrations.json');

for (const version of fixture.versions) {
    test('published Remnawave ' + version.tag + ' SQL history remains byte compatible', () => {
        assert(version.files.length >= 124);
        for (const entry of version.files) {
            assert.match(entry.name, /^[a-zA-Z0-9_]+$/);
            const file = path.join(__dirname, '../prisma/migrations', entry.name, 'migration.sql');
            const bytes = Buffer.from(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
            const hash = crypto.createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
            assert.equal(hash, entry.gitBlobSha1, entry.name);
        }
    });
}
