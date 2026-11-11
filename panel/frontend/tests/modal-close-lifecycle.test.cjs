const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function fixture(keepMounted = false) {
    const slots = [], effects = [], frames = new Map(), calls = [];
    let index = 0, frame = 0, visible = true, result;
    const react = {
        useState(initial) {
            const i = index++;
            if (!(i in slots)) slots[i] = initial;
            return [slots[i], value => { slots[i] = value; }];
        },
        useRef(initial) {
            const i = index++;
            return slots[i] ?? (slots[i] = { current: initial });
        },
        useCallback: callback => callback,
        useEffectEvent: callback => callback,
        useEffect(callback, deps) {
            const i = index++;
            const old = slots[i];
            if (!old || deps.some((value, j) => value !== old.deps[j])) {
                effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: callback() }; });
            }
        }
    };
    react.useLayoutEffect = react.useEffect;
    const module = { exports: {} };
    const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/shared/_modals/use-nice-modal.tsx'), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText;
    new Function('require', 'module', 'exports', 'requestAnimationFrame', 'cancelAnimationFrame', 'document', source)(
        name => name === 'react' ? react : name.includes('use-is-mobile') ? { useIsMobile: () => false } : {},
        module, module.exports,
        callback => { frames.set(++frame, callback); return frame; },
        id => frames.delete(id),
        { addEventListener() {}, removeEventListener() {} }
    );
    const render = () => {
        index = 0;
        result = module.exports.useNiceMantineModal({
            modal: { id: 'test', visible, keepMounted, hide: () => { visible = false; calls.push('hide'); }, resolveHide: () => calls.push('resolved'), remove: () => calls.push('removed') },
            onClose: () => calls.push('afterClose')
        });
        effects.splice(0).forEach(effect => effect());
        return result;
    };
    render();
    return { calls, render, get result() { return result; }, show: () => { visible = true; return render(); }, frame: () => { frames.forEach(callback => callback()); frames.clear(); return render(); } };
}

test('modal keeps content until exit, then resolves hide before cleanup and removal', () => {
    const state = fixture();
    assert.equal(state.result.modalProps.opened, false);
    state.frame();
    assert.equal(state.result.modalProps.opened, true);
    state.result.hide();
    state.result.hide();
    state.render();
    assert.deepEqual(state.calls, ['hide']);
    state.result.modalProps.onExitTransitionEnd();
    assert.deepEqual(state.calls, ['hide', 'resolved', 'afterClose', 'removed']);
});

test('a stale exit cannot remove a reopened modal or execute its previous cleanup', () => {
    const state = fixture();
    state.frame();
    state.result.hide();
    const stale = state.render().modalProps.onExitTransitionEnd;
    state.show();
    stale();
    assert.deepEqual(state.calls, ['hide']);
    state.result.hide();
    state.render().modalProps.onExitTransitionEnd();
    assert.deepEqual(state.calls, ['hide', 'hide', 'resolved', 'afterClose', 'removed']);
});

test('closing before the initial animation frame resolves without leaving a ghost modal', () => {
    const state = fixture();
    state.result.hide();
    state.render();
    assert.deepEqual(state.calls, ['hide', 'resolved', 'afterClose', 'removed']);
});

test('keepMounted resolves the hide promise without removing the modal', () => {
    const state = fixture(true);
    state.frame();
    state.result.hide();
    state.render().modalProps.onExitTransitionEnd();
    assert.deepEqual(state.calls, ['hide', 'resolved', 'afterClose']);
});
