const fs = require('node:fs');
const { createRequire } = require('node:module');
const ts = require('typescript');
const path = require('node:path');

function loadTypescript(filename, mocks = {}, globals = {}) {
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
        (id) => {
            if (id === '@common/xray-mode/xray-mode-conflict' && (!Object.hasOwn(mocks,id) || Object.keys(mocks[id]).length === 0)) {
                return loadTypescript(path.join(__dirname, '../src/common/xray-mode/xray-mode-conflict.ts'), mocks, globals);
            }
            if (Object.hasOwn(mocks,id)) return mocks[id];
            if (id.startsWith('@common/xray-mode/')) {
                return loadTypescript(path.join(__dirname, '../src/common/xray-mode', id.slice('@common/xray-mode/'.length) + '.ts'), mocks, globals);
            }
            if(id.startsWith('.')) {
                const sibling=path.resolve(path.dirname(filename),id+'.ts');
                if(fs.existsSync(sibling)) return loadTypescript(sibling,mocks,globals);
            }
            return localRequire(id);
        }, ref, ref.exports,
        ...Object.values(globals),
    );
    return ref.exports;
}
module.exports=loadTypescript;
