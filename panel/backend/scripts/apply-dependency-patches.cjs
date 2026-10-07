'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = require('../patches/manifest.json');
const digest = (text) => createHash('sha256').update(text).digest('hex');
const pending = [];

// Apply only the reviewed patches to their pinned package contents. A dependency
// update with different contents requires reviewing and regenerating the manifest.
for (const patch of manifest) {
    if (!/^node_modules\/(nestjs-zod|xray-typed)\/dist\/[\w./-]+$/.test(patch.path) || patch.path.includes('..')) {
        throw new Error('Invalid dependency patch path');
    }
    const target = path.join(root, patch.path);
    const original = fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
    if (digest(original) === patch.afterSha256) continue;
    if (digest(original) !== patch.beforeSha256) {
        throw new Error(`Dependency contents changed; review the patch for ${patch.path}`);
    }
    let result = original;
    for (const change of patch.changes) {
        const first = result.indexOf(change.before);
        if (first < 0 || result.indexOf(change.before, first + 1) !== -1) {
            throw new Error(`Ambiguous dependency patch context: ${patch.path}`);
        }
        result = result.slice(0, first) + change.after + result.slice(first + change.before.length);
    }
    if (digest(result) !== patch.afterSha256) throw new Error(`Dependency patch checksum mismatch: ${patch.path}`);
    pending.push({ target, result });
}

// Validate every file before changing any dependency.
for (const { target, result } of pending) fs.writeFileSync(target, result);
console.log(`Dependency patches verified (${manifest.length} files; ${pending.length} updated)`);
