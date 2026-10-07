const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')
const ts = require('typescript')

const filename = path.join(__dirname, '../src/widgets/dashboard/users/users-import/prepare-import-users.ts')
const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText
const exportsObject = {}
vm.runInNewContext(output, { exports: exportsObject })
const prepareImportUsers = exportsObject.prepareImportUsers

test('disabling squad restoration strips inherited names without changing credentials or the uploaded file', () => {
    const users = [{ username: 'alice', activeInternalSquads: ['Premium'], vlessUuid: 'credential', expireAt: '2030-01-01T00:00:00Z' }]
    const prepared = prepareImportUsers(users, false)
    assert.equal(prepared[0].activeInternalSquads.length, 0)
    assert.equal(prepared[0].vlessUuid, 'credential')
    assert.equal(prepared[0].expireAt, users[0].expireAt)
    assert.deepEqual(users[0].activeInternalSquads, ['Premium'])
    assert.notEqual(prepared[0], users[0])
})

test('restoration can be enabled again for the same uploaded file', () => {
    const users = [{ username: 'alice', activeInternalSquads: ['Premium'] }, { username: 'bob' }]
    prepareImportUsers(users, false)
    assert.equal(prepareImportUsers(users, true), users)
    assert.deepEqual(users[0].activeInternalSquads, ['Premium'])
})
