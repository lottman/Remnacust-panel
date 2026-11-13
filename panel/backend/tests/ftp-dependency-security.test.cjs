const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const { Client } = require('basic-ftp');
const { parseLine } = require('basic-ftp/dist/parseListMLSD.js');

test('FTP directory facts cannot call inherited object properties', () => {
    for (const key of ['__proto__', 'constructor', 'toString']) {
        const info = parseLine(`${key}=ignored;type=file;size=7; fixture.dat`);
        assert.equal(info.name, 'fixture.dat');
        assert.equal(info.size, 7);
    }
});

test(
    'FTP authentication with a control character rejects instead of crashing the process',
    { timeout: 5000 },
    async () => {
        const sockets = new Set();
        const server = net.createServer((socket) => {
            sockets.add(socket);
            socket.on('close', () => sockets.delete(socket));
            socket.on('error', () => {});
            socket.write('220 fixture ready\r\n');
            let pending = '';
            socket.on('data', (data) => {
                pending += data;
                while (pending.includes('\r\n')) {
                    const end = pending.indexOf('\r\n');
                    const command = pending.slice(0, end);
                    pending = pending.slice(end + 2);
                    socket.write(
                        command.startsWith('USER ') ? '331 password required\r\n' : '200 ok\r\n',
                    );
                }
            });
        });
        const client = new Client(1000);
        try {
            await new Promise((resolve, reject) => {
                server.once('error', reject);
                server.listen(0, '127.0.0.1', resolve);
            });
            await assert.rejects(
                client.access({
                    host: '127.0.0.1',
                    port: server.address().port,
                    user: 'fixture',
                    password: 'invalid\r\nfixture',
                }),
                /control characters/i,
            );
        } finally {
            client.close();
            for (const socket of sockets) socket.destroy();
            await new Promise((resolve) => server.close(resolve));
        }
    },
);
