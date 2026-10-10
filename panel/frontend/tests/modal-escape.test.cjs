const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const filename = path.join(__dirname, '../src/shared/_modals/use-nice-modal.tsx');
const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handler = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'handleKeyDown');
assert.ok(handler);

function setup(popups = []) {
    let closes = 0;
    const context = {
        stack: [{ hide: () => closes++ }],
        document: { querySelectorAll: () => popups },
        isPseudoFullscreenActive: () => false,
        hasManagedModalOpen: () => false
    };
    vm.createContext(context);
    vm.runInContext(ts.transpileModule(handler.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
    return { press: event => context.handleKeyDown({ key: 'Escape', ...event }), closes: () => closes, context };
}

test('first Escape leaves the editor open while a portal listbox is visible', () => {
    const popups = [{ closest: () => null, getClientRects: () => [{}] }];
    const state = setup(popups);
    state.press();
    assert.equal(state.closes(), 0);
    popups.length = 0;
    state.press();
    assert.equal(state.closes(), 1);
});

test('hidden popups and embedded lists do not trap Escape', () => {
    const state = setup([
        { closest: () => null, getClientRects: () => [] },
        { closest: () => ({}), getClientRects: () => [{}] }
    ]);
    state.press();
    assert.equal(state.closes(), 1);
});

test('handled Escape and composition leave the editor open', () => {
    const state = setup();
    state.press({ defaultPrevented: true });
    state.press({ isComposing: true });
    state.press({ key: 'Enter' });
    assert.equal(state.closes(), 0);
});

test('a nested modal or editor fullscreen retains Escape ownership', () => {
    const state = setup();
    state.context.hasManagedModalOpen = () => true;
    state.press();
    state.context.hasManagedModalOpen = () => false;
    state.context.isPseudoFullscreenActive = () => true;
    state.press();
    assert.equal(state.closes(), 0);
});
