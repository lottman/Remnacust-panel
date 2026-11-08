const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const directory = path.join(__dirname, '../src/widgets/dashboard/templates/subscription-template-editor');
const flatten = value => Array.isArray(value) ? value.flatMap(flatten) : !value || typeof value !== 'object' ? [] : [value, ...flatten(value.props?.children)];
function harness(file, name, initial) {
    const state = []; let cursor = 0, props = initial;
    const names = ['ActionIcon','Button','Group','Modal','Pagination','Stack','Text','Badge','Code'];
    const Accordion = Object.assign(() => {}, { Item: 'Item', Control: 'Control', Panel: 'Panel' });
    const mocks = { react: { useState(value) { const key = cursor++; if (!(key in state)) state[key] = value; return [state[key], next => { state[key] = typeof next === 'function' ? next(state[key]) : next; }]; } },
        '@mantine/core': { ...Object.fromEntries(names.map(key => [key,key])), Accordion, ScrollArea: { Autosize: 'Autosize' } },
        '@mantine/hooks': { useMediaQuery: () => true },
        'react-i18next': { useTranslation: () => ({ t: (key, args) => args?.name ? key + ':' + args.name : key }) },
        './autoselect-panel.module.css': {} };
    const ref = {exports:{}};
    const code = ts.transpileModule(fs.readFileSync(path.join(directory,file),'utf8'), {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
    new Function('require','module','exports',code)(key => Object.hasOwn(mocks,key) ? mocks[key] : require(key),ref,ref.exports);
    return { render(){cursor=0; return flatten(ref.exports[name](props));}, update(next){props=next;} };
}

test('server ordering stays in a scrollable mobile dialog and moving across pages uses global indices', () => {
    let values = Array.from({length:45}, (_,i) => 'host-'+i);
    const options = values.map(value => ({value,label:value}));
    const props = () => ({values,options,onChange:next => {values=next; panel.update(props());}});
    const panel = harness('priority-order.tsx','PriorityOrder',props());
    let view = panel.render();
    const modal = view.find(item => item.type === 'Modal');
    assert.equal(modal.props.opened,false);
    assert.equal(modal.props.fullScreen,true);
    assert.equal(modal.props.scrollAreaComponent,'Autosize');
    assert.equal(view.filter(item => item.type==='ActionIcon').length,40);
    view.find(item=>item.type==='Button').props.onClick();
    view = panel.render(); assert.equal(view.find(item=>item.type==='Modal').props.opened,true);
    view.find(item=>item.type==='Pagination').props.onChange(2);
    view=panel.render();
    view.find(item=>item.type==='ActionIcon' && item.props['aria-label']==='autoselect.priority-up:host-20').props.onClick();
    assert.equal(values[19],'host-20'); assert.equal(values[20],'host-19');
    view=panel.render(); assert.equal(view.find(item=>item.type==='Pagination').props.value,1);
    assert.equal(view.filter(item=>item.type==='ActionIcon')[0].props.disabled,true);
    view.find(item=>item.type==='Modal').props.onClose();
    assert.equal(panel.render().find(item=>item.type==='Modal').props.opened,false);
});

test('the code changes panel disappears after saving while actual additions remain visible', () => {
    const panel=harness('template-changes.tsx','TemplateChanges',{changes:[]});
    assert.deepEqual(panel.render(),[]);
    panel.update({changes:[{path:'routing.balancers.0',kind:'added',after:{tag:'auto'}}]});
    assert(panel.render().length>0);
});
