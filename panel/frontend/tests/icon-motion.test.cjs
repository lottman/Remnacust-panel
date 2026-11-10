const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const filename = path.join(__dirname, '../src/shared/ui/appearance/icon-motion.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const ref = { exports: {} };
new Function('require', 'module', 'exports', compiled)(require, ref, ref.exports);
const { iconPartFrames } = ref.exports;

test('stroke and filled glyph details have distinct animations without moving or resizing the icon', () => {
    const stroke = iconPartFrames(true, 42);
    const fill = iconPartFrames(false, 0);
    assert.equal(stroke[0].strokeDashoffset, 42);
    assert.equal(stroke.at(-1).strokeDashoffset, 0);
    assert.equal(fill.at(-1).filter, 'brightness(1)');
    assert.equal(fill[0].clipPath, 'inset(0 0 100% 0)');
    assert.equal(fill.at(-1).clipPath, 'inset(0 0 0 0)');
    assert(iconPartFrames(false, 0, true).every(frame => !Object.hasOwn(frame, 'clipPath')));
    assert.notDeepEqual(stroke, fill);
    for (const frames of [stroke, fill, iconPartFrames(true, NaN), iconPartFrames(true, 0)])
        for (const frame of frames) {
            for (const key of ['transform', 'scale', 'translate', 'rotate', 'width', 'height']) assert(!Object.hasOwn(frame, key));
            assert(frame.opacity > 0 && frame.opacity <= 1);
        }
});

test('the previous pressed glyph bounce and root SVG refresh rotation are removed', () => {
    const root = path.join(__dirname, '../src');
    const hook = fs.readFileSync(path.join(root, 'shared/ui/appearance/use-icon-motion.ts'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'global.css'), 'utf8');
    const refresh = fs.readFileSync(path.join(root, 'shared/ui/refresh-control/refresh-control.module.css'), 'utf8');
    assert(hook.includes('installIconMotion'));
    assert(!hook.includes('.animate('));
    assert(!css.includes('[data-panel-icon-pressed]'));
    assert(!css.includes('scale: 1.08'));
    assert(!refresh.includes('rotate('));
});
