const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const net = require('node:net');
const { EventEmitter } = require('node:events');
const load = require('./load-typescript.cjs');
const { MtlsSocksProxyAgent } = load(path.join(__dirname, '../src/common/axios/mtls-agent.ts'));
const mtls = { ca: 'fixture-ca', cert: 'fixture-cert', key: 'fixture-key' };

test('actual SOCKS transport passes bare IPv6 to TCP while preserving IPv4, DNS and encoded authentication', async (t) => {
    const connections = [];
    t.mock.method(net.Socket.prototype, 'connect', function (options) {
        connections.push(options);
        queueMicrotask(() => this.emit('error', new Error('fixture stops before network access')));
        return this;
    });
    for (const [address, expected] of [
        ['[2001:db8::1]', '2001:db8::1'],
        ['[::ffff:192.0.2.1]', '::ffff:c000:201'],
        ['192.0.2.1', '192.0.2.1'],
        ['proxy.example.test', 'proxy.example.test'],
    ]) {
        const agent = new MtlsSocksProxyAgent(
            `socks5://user%40name:p%3Ass@${address}:1080`,
            mtls,
            'node.example.test',
        );
        try {
            const req = new EventEmitter();
            req.destroy = () => {};
            await assert.rejects(
                agent.connect(req, {
                    host: '192.0.2.2',
                    port: 443,
                    secureEndpoint: true,
                    lookup: (host, _options, done) => done(null, host, 4),
                }),
                /fixture stops before network access/,
            );
            assert.equal(connections.at(-1).host, expected);
            assert.equal(connections.at(-1).port, 1080);
            assert.equal(agent.proxy.type, 5);
            assert.equal(agent.proxy.userId, 'user@name');
            assert.equal(agent.proxy.password, 'p:ss');
            assert.equal(Object.keys(agent.proxy).includes('password'), false);
            assert.equal(agent.keepAlive, true);
        } finally {
            agent.destroy();
        }
    }
    assert.equal(connections.length, 4);
});

test('IPv6 SOCKS normalization preserves rejection of invalid and unsupported proxy URLs', () => {
    for (const uri of [
        'socks5://2001:db8::1:1080',
        'socks5://[fe80::1%eth0]:1080',
        'socks5://[192.0.2.1]:1080',
        'socks5://[::1]:0',
        'socks5://[::1]:1080/path',
        'socks5://[::1]:1080?query',
        'socks5://user%0A:pass@[::1]:1080',
        'socks5://[::1]:1080 ',
        'http://[::1]:1080',
    ])
        assert.throws(
            () => new MtlsSocksProxyAgent(uri, mtls, undefined),
            /Invalid node SOCKS5 proxy configuration/,
        );
});
