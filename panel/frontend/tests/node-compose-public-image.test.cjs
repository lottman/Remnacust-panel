const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const YAML = require('yaml');

function compose(port, secret = 'fixture-secret$with:yaml\nnext-line') {
    let copied;
    const module = { exports: {} };
    const Container = ({ children }) => React.createElement('div', null, children);
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/shared/_modals/nodes/create-node-modal/create-node-steps/copy-docker-compose.widget.tsx'), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
    }).outputText;
    const mocks = {
        '@mantine/core': { Stack: Container, Text: Container, CopyButton: ({ value }) => { copied = value; return null; } },
        '@shared/api/hooks': { useGetNodeSecretKey: () => ({ data: { secretKey: secret } }) },
        'react-i18next': { useTranslation: () => ({ t: key => key }) }
    };
    new Function('require', 'module', 'exports', code)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), module, module.exports);
    renderToStaticMarkup(React.createElement(module.exports.CopyDockerComposeWidget, { port }));
    return YAML.parse(copied);
}

test('manual node Compose uses the public latest image and stable persistent state volumes', () => {
    const config = compose(7289);
    const service = config.services.remnanode;
    assert.equal(service.image, 'ghcr.io/lottman/remnacust-node:latest');
    assert.equal(service.environment.NODE_PORT, 7289);
    assert.deepEqual(service.volumes, [
        'remnanode-core:/var/lib/remnawave/core-manager',
        'remnanode-policy:/var/lib/remnanode',
        'remnanode-runtime:/var/lib/remnacust/run'
    ]);
    assert.deepEqual(Object.keys(config.volumes), ['remnanode-core', 'remnanode-policy', 'remnanode-runtime']);
    assert.deepEqual(compose(7289), config);
    assert.equal(compose().services.remnanode.environment.NODE_PORT, 2222);
});

test('the node key stays a YAML scalar and Compose variable interpolation remains escaped', () => {
    const secret = 'fixture$secret: ${NOT_AN_ENV}\nnext-line';
    assert.equal(compose(2222, secret).services.remnanode.environment.SECRET_KEY, secret.replaceAll('$', '$$'));
});
