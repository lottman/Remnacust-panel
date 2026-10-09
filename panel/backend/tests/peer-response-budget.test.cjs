const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const load = require('./load-typescript.cjs');

function service(filename, globals = {}) {
    const mocks = {};
    for (const [, module] of fs.readFileSync(filename, 'utf8').matchAll(/from '([^']+)'/g)) {
        if (module.startsWith('@common/') || module.startsWith('@modules/') ||
            module.startsWith('@contract/') || module.startsWith('@remnawave/') || module.startsWith('.')) mocks[module] = {};
    }
    return load(filename, mocks, globals).AxiosService;
}

test('node and subscription-page HTTP clients bound decoded responses from their peers', async () => {
    const PanelAxios = service(path.join(__dirname, '../src/common/axios/axios.service.ts'));
    const subpage = [path.join(__dirname, '../../../subscription-page/backend'),
        path.join(__dirname, '../../subscription-page/backend')]
        .find(directory => fs.existsSync(path.join(directory, 'package.json')));
    assert(subpage, 'subscription-page source must be available');
    const PageAxios = service(path.join(subpage, 'src/common/axios/axios.service.ts'), {
        __RW_SUBPAGE_VERSION__: 'fixture',
    });
    const clients = [
        new PanelAxios({}, {}, {}).axiosInstance,
        new PageAxios({ getOrThrow: key => key === 'REMNAWAVE_PANEL_URL' ? 'http://127.0.0.1' : 'fixture', get: () => undefined }).axiosInstance,
    ];
    const limits = [100_000_000, 16 * 1024 * 1024];
    for (const [index, client] of clients.entries()) {
        assert(client.defaults.maxContentLength > 0 && client.defaults.maxContentLength <= limits[index],
            'a trusted/authenticated peer must not have an unlimited response budget');
    }
    const wire = zlib.gzipSync(Buffer.alloc(8192, 'a'));
    assert(wire.length < 1024);
    const server = http.createServer((_req, res) => {
        res.writeHead(200, { 'content-encoding': 'gzip', 'content-type': 'text/plain' });
        res.end(wire);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        for (const client of clients) {
            await assert.rejects(client.get(`http://127.0.0.1:${server.address().port}/`, { maxContentLength: 1024 }),
                error => error.code === 'ERR_BAD_RESPONSE' && /maxContentLength/.test(error.message));
        }
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});
