const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const vm = require('node:vm');
const redirects = require('follow-redirects');

test('cross-realm sensitive header lists cannot leak custom credentials on a cross-origin redirect', async () => {
    let received;
    const destination = http.createServer((request, response) => {
        received = request.headers;
        response.writeHead(204).end();
    });
    await new Promise(resolve => destination.listen(0, '127.0.0.1', resolve));
    const origin = http.createServer((_request, response) => {
        response.writeHead(302, { location: `http://127.0.0.1:${destination.address().port}/` }).end();
    });
    await new Promise(resolve => origin.listen(0, '127.0.0.1', resolve));
    try {
        for (const sensitiveHeaders of [['x-api-key'], vm.runInNewContext("['x-api-key']")]) {
            await new Promise((resolve, reject) => {
                const request = redirects.http.get(`http://127.0.0.1:${origin.address().port}/`, {
                    sensitiveHeaders, maxRedirects: 1,
                    headers: { 'X-Api-Key': 'local-fixture-secret', 'X-Harmless': 'keep' },
                }, response => {
                    response.resume();
                    response.once('end', resolve);
                    response.once('error', reject);
                });
                request.setTimeout(5000, () => request.destroy(new Error('redirect test timeout')));
                request.once('error', reject);
            });
            assert.equal(received['x-api-key'], undefined);
            assert.equal(received['x-harmless'], 'keep');
        }
    } finally {
        await Promise.all([origin, destination].map(server => new Promise(resolve => server.close(resolve))));
    }
});
