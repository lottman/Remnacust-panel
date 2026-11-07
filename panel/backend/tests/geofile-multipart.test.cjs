const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const load = require('./load-typescript.cjs');
const { mocks, pool } = require('./client-pool-fixture.cjs');
const { readGeofileMultipart } = load(
    path.join(__dirname, '../src/modules/subscription-template/geofiles/geofile-multipart.ts'),
    { ...mocks, '../generators/client-pool': pool },
);

const boundary = 'bounded-geofile-fixture';
const metadata = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n{"name":"Copy","selections":[]}\r\n`,
);
const prefix = Buffer.concat([
    metadata,
    Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="file.dat"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
]);
const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
const requestStream = () =>
    Object.assign(new PassThrough(), {
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
        complete: true,
    });

test('multipart accepts exactly 64 MiB and rejects the next byte without retaining request listeners', async () => {
    for (const extra of [0, 1]) {
        const request = requestStream();
        const result = readGeofileMultipart(request);
        const outcome = extra ? assert.rejects(() => result, /geofile-multipart/) : result;
        request.write(prefix);
        const chunk = Buffer.alloc(1024 * 1024, 120);
        for (let n = 0; n < 64; n++) request.write(chunk);
        if (extra) request.write(Buffer.from('x'));
        request.end(suffix);
        const parsed = await outcome;
        if (!extra) assert.equal(parsed.data.length, 64 * 1024 * 1024);
        for (const event of ['aborted', 'error', 'close'])
            assert.equal(request.listenerCount(event), 0, event);
    }
});

test('malformed/truncated multipart and bounded deadline reject and release parser listeners', async () => {
    for (const mode of ['boundary', 'truncated', 'aborted', 'deadline']) {
        let fire;
        const request = requestStream();
        if (mode === 'boundary') request.headers['content-type'] = 'multipart/form-data';
        const parser =
            mode === 'deadline'
                ? load(
                      path.join(
                          __dirname,
                          '../src/modules/subscription-template/geofiles/geofile-multipart.ts',
                      ),
                      { ...mocks, '../generators/client-pool': pool },
                      {
                          setTimeout: (fn) => {
                              fire = fn;
                              return 1;
                          },
                          clearTimeout: () => {},
                      },
                  ).readGeofileMultipart
                : readGeofileMultipart;
        const result = assert.rejects(() => parser(request), /geofile-multipart/);
        if (mode !== 'boundary') request.write(prefix);
        if (mode === 'truncated') request.end('partial');
        if (mode === 'aborted') request.emit('aborted');
        if (mode === 'deadline') fire();
        await result;
        for (const event of ['aborted', 'error', 'close'])
            assert.equal(request.listenerCount(event), 0, mode + ':' + event);
        request.destroy();
    }
});

test('actual client disconnect rejects a partial multipart upload and a later request succeeds', async () => {
    let rejected, receivedPartial;
    const partial = Buffer.alloc(1024, 120);
    const partialReceived = new Promise((resolve) => {
        receivedPartial = resolve;
    });
    const failure = new Promise((resolve) => {
        rejected = resolve;
    });
    const waitFor = async (promise, message) => {
        let timer;
        try {
            return await Promise.race([
                promise,
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(Error(message)), 2000);
                }),
            ]);
        } finally {
            clearTimeout(timer);
        }
    };
    const server = http.createServer(async (request, response) => {
        const upload = readGeofileMultipart(request);
        if (request.url === '/abort') {
            let received = 0;
            const onData = (chunk) => {
                received += chunk.length;
                if (received >= prefix.length + partial.length) {
                    request.off('data', onData);
                    receivedPartial({
                        complete: request.complete,
                        listening: request.listenerCount('aborted') > 0,
                    });
                }
            };
            request.on('data', onData);
        }
        try {
            const parsed = await upload;
            response.end(String(parsed.data.length));
        } catch {
            if (request.url === '/abort') rejected();
            if (!response.destroyed) response.writeHead(400).end();
        }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    let request, lookupTimer;
    try {
        request = http.request({
            hostname: 'multipart.fixture.test',
            port: server.address().port,
            path: '/abort',
            method: 'POST',
            headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
            lookup: (_hostname, options, callback) => {
                lookupTimer = setTimeout(
                    () =>
                        callback(
                            null,
                            options.all ? [{ address: '127.0.0.1', family: 4 }] : '127.0.0.1',
                            4,
                        ),
                    75,
                );
            },
        });
        request.on('error', () => {});
        request.write(prefix);
        request.write(partial);
        assert.deepEqual(await waitFor(partialReceived, 'partial upload did not reach server'), {
            complete: false,
            listening: true,
        });
        request.destroy();
        await waitFor(failure, 'abort did not settle');
        const form = new FormData();
        form.append('metadata', '{"name":"Copy","selections":[]}');
        form.append('file', new Blob(['valid']));
        const response = await fetch(url, { method: 'POST', body: form });
        assert.equal(response.status, 200);
        assert.equal(await response.text(), '5');
    } finally {
        clearTimeout(lookupTimer);
        request?.destroy();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
});
