const fs = require('node:fs');
const { createRequire } = require('node:module');
const ts = require('typescript');

module.exports = function loadTypescript(filename, mocks = {}, globals = {}) {
    const localRequire = createRequire(filename);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            experimentalDecorators: true,
            esModuleInterop: true,
        },
    }).outputText;
    const ref = { exports: {} };
    new Function('require', 'module', 'exports', ...Object.keys(globals), compiled)(
        (id) => Object.hasOwn(mocks, id) ? mocks[id] : localRequire(id), ref, ref.exports,
        ...Object.values(globals),
    );
    return ref.exports;
};
