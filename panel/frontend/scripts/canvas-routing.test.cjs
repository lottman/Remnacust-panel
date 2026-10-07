const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const filename = path.join(__dirname, '../src/pages/dashboard/config-profiles/components/profile-canvas-routing.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const ref = { exports: {} };
new Function('exports', compiled)(ref.exports);
const { routeCanvasLink, canvasRoutePath, createCanvasRouter } = ref.exports;
function assertClear(points, cards, from, to) {
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        assert.ok(a.x === b.x || a.y === b.y);
        for (const card of cards) {
            if ((i === 1 && card === from) || (i === points.length - 1 && card === to)) continue;
            const hit = a.x === b.x
                ? a.x > card.x - 7 && a.x < card.x + 239 && Math.max(a.y,b.y) > card.y - 7 && Math.min(a.y,b.y) < card.y + 79
                : a.y > card.y - 7 && a.y < card.y + 79 && Math.max(a.x,b.x) > card.x - 7 && Math.min(a.x,b.x) < card.x + 239;
            assert.equal(hit, false, `segment ${i} overlaps ${card.id}`);
        }
    }
    assert.equal(canvasRoutePath(points).includes('NaN'), false);
}
test('long, adjacent, backward and same-column links avoid every card', () => {
    const cards = [];
    for (let col = 0; col < 9; col++) {
        for (let row = 0; row < 24; row++) {
            cards.push({ id: `${col}-${row}`, x: 40 + col * 300, y: 60 + row * 124 + col % 3 * 12 });
        }
    }
    for (let i = 0; i < cards.length; i++) {
        for (const offset of [1, 23, 24, 85, 175]) {
            const from = cards[i], to = cards[(i + offset) % cards.length];
            assertClear(routeCanvasLink(from, to, cards), cards, from, to);
        }
    }
});
test('routing cache is stable and rebuilds for a changed layout', () => {
    const a = { id: 'a', x: 40, y: 60 }, b = { id: 'b', x: 640, y: 300 };
    const router = createCanvasRouter([a,b]);
    assert.equal(router(a,b), router(a,b));
    const blocker = { id: 'blocker', x: 340, y: 80 };
    const updated = createCanvasRouter([a,b,blocker]);
    assertClear(routeCanvasLink(a,b,[a,b,blocker]), [a,b,blocker], a,b);
    assert.notEqual(updated(a,b), router(a,b));
});

function sampledPath(d) {
    const tokens = d.match(/[MCLQ]|-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi);
    const points = [];
    let at = 0, current;
    const point = () => ({ x: Number(tokens[at++]), y: Number(tokens[at++]) });
    while (at < tokens.length) {
        const command = tokens[at++];
        if (command === 'M') { current = point(); continue; }
        const controls = [current];
        for (let n = 0; n < ({ L: 1, Q: 2, C: 3 })[command]; n++) controls.push(point());
        for (let step = 0; step <= 100; step++) {
            const t = step / 100;
            let row = controls;
            while (row.length > 1) row = row.slice(1).map((p,i) => ({
                x: row[i].x * (1-t) + p.x*t, y: row[i].y * (1-t) + p.y*t,
            }));
            points.push(row[0]);
        }
        current = controls.at(-1);
    }
    return points;
}

test('original curves stay unchanged when clear; obstructed curves descend before crossing', () => {
    const a = { id: 'a', x: 340, y: 60 }, b = { id: 'b', x: 1540, y: 1100 };
    const original = createCanvasRouter([a,b])(a,b);
    assert.equal(original, 'M 572 96 C 1056 96, 1056 1136, 1540 1136');
    const cards = [a,b,...Array.from({ length: 5 }, (_,i) => ({ id: 'h'+i, x:640, y:60+i*124 }))];
    const routed = createCanvasRouter(cards)(a,b);
    assert.ok((routed.match(/C /g) || []).length >= 2);
    assert.ok(routed.startsWith('M 572 96 C 596 96'));
    for (const p of sampledPath(routed)) for (const card of cards) {
        assert.equal(p.x > card.x + .01 && p.x < card.x+232-.01 && p.y > card.y+.01 && p.y < card.y+72-.01, false);
    }
});

test('a blocking card is bypassed locally without descending below its whole column', () => {
    const from = { id: 'from', x: 40, y: 60 }, to = { id: 'to', x: 940, y: 1100 };
    const cards = [from, to, ...Array.from({ length: 9 }, (_, i) => ({ id: `block-${i}`, x: 340, y: 60 + i * 124 }))];
    const points = sampledPath(createCanvasRouter(cards)(from, to));
    const passage = points.filter(p => p.x > 340 && p.x < 572);
    assert.ok(passage.length > 0);
    assert.ok(passage.every(p => p.y >= 140 && p.y <= 176), 'use the first gap below the obstructing card');
});

test('rendered smooth curves also avoid staggered intermediate cards', () => {
    const cards=[];
    for(let col=0;col<8;col++) for(let row=0;row<10;row++)
        cards.push({id:`${col}-${row}`,x:40+col*300,y:60+row*124+(col%3)*12});
    const route=createCanvasRouter(cards);
    for(let i=0;i<cards.length;i++) for(const offset of [1,10,35,57]) {
        const from=cards[i],to=cards[(i+offset)%cards.length];
        for(const p of sampledPath(route(from,to))) for(const card of cards)
            assert.equal(p.x>card.x+.01 && p.x<card.x+232-.01 && p.y>card.y+.01 && p.y<card.y+72-.01,false,`overlap ${card.id}`);
    }
});
