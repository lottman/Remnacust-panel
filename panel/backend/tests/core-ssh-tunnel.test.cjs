const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { connect } = require('node:net');
const { PassThrough } = require('node:stream');
const { test } = require('node:test');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/modules/node-ssh/ssh/core-ssh-tunnel.ts');
const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);
const { CoreSshTunnel } = compiled.exports;

function readBytes(socket) {
    let buffer = Buffer.alloc(0);
    let waiter = null;
    socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (waiter && buffer.length >= waiter.length) {
            const { length, resolve } = waiter;
            waiter = null;
            const value = buffer.subarray(0, length);
            buffer = buffer.subarray(length);
            resolve(value);
        }
    });
    return (length) => new Promise((resolve, reject) => {
        if (buffer.length >= length) {
            const value = buffer.subarray(0, length);
            buffer = buffer.subarray(length);
            return resolve(value);
        }
        waiter = { length, resolve };
        setTimeout(() => reject(new Error('SOCKS response timed out')), 2000).unref();
    });
}

test('SSH bridge accepts only the selected node API and relays bytes', async () => {
    const forwarded = [];
    const ssh = {
        forwardOut: (src, srcPort, dst, dstPort, done) => {
            forwarded.push([src, dst, dstPort]);
            done(null, new PassThrough());
        },
    };
    const tunnel = new CoreSshTunnel(ssh, ['104.194.148.144'], 2222);
    const port = await tunnel.listen();
    const socket = connect(port, '127.0.0.1');
    const read = readBytes(socket);
    try {
        socket.write(Buffer.from([5, 1, 0]));
        assert.deepEqual(await read(2), Buffer.from([5, 0]));
        socket.write(Buffer.from([5, 1, 0, 1, 104, 194, 148, 144, 0x08, 0xae]));
        assert.equal((await read(10))[1], 0);
        socket.write('ping');
        assert.equal((await read(4)).toString(), 'ping');
        assert.deepEqual(forwarded, [['127.0.0.1', '127.0.0.1', 2222]]);
    } finally {
        socket.destroy();
        tunnel.close();
    }
});

test('SSH bridge denies other hosts and ports', async () => {
    let forwarded = false;
    const tunnel = new CoreSshTunnel({ forwardOut: () => { forwarded = true; } }, ['104.194.148.144'], 2222);
    const port = await tunnel.listen();
    const socket = connect(port, '127.0.0.1');
    const read = readBytes(socket);
    try {
        socket.write(Buffer.from([5, 1, 0]));
        await read(2);
        socket.write(Buffer.from([5, 1, 0, 1, 104, 194, 148, 145, 0x08, 0xae]));
        assert.equal((await read(10))[1], 2);
        assert.equal(forwarded, false);
    } finally {
        socket.destroy();
        tunnel.close();
    }
});

test('SSH bridge accepts a SOCKS domain request for the registered node', async () => {
    const forwarded = [];
    const ssh = {
        forwardOut: (src, srcPort, dst, dstPort, done) => {
            forwarded.push([dst, dstPort]);
            done(null, new PassThrough());
        },
    };
    const host = 'node.example.test';
    const tunnel = new CoreSshTunnel(ssh, [host], 3000);
    const port = await tunnel.listen();
    const socket = connect(port, '127.0.0.1');
    const read = readBytes(socket);
    try {
        socket.write(Buffer.from([5, 1, 0]));
        assert.deepEqual(await read(2), Buffer.from([5, 0]));
        const hostBytes = Buffer.from(host);
        const request = Buffer.concat([
            Buffer.from([5, 1, 0, 3, hostBytes.length]),
            hostBytes,
            Buffer.from([0x0b, 0xb8]),
        ]);
        socket.write(request.subarray(0, 6));
        socket.write(request.subarray(6));
        assert.equal((await read(10))[1], 0);
        socket.write('ready');
        assert.equal((await read(5)).toString(), 'ready');
        assert.deepEqual(forwarded, [['127.0.0.1', 3000]]);
    } finally {
        socket.destroy();
        tunnel.close();
    }
});
