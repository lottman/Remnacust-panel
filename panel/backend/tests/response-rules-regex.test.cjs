const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const load = require('./load-typescript.cjs');
const constants = require('../libs/contract/build/backend/constants');
const bounded = load(path.join(__dirname, '../src/common/utils/bounded-regex.ts'));
const { ResponseRulesMatcherService } = load(
    path.join(__dirname, '../src/modules/subscription-response-rules/services/response-rules-matcher.service.ts'),
    { '@libs/contracts/constants': constants, '@common/utils/bounded-regex': bounded },
);
const matcher = new ResponseRulesMatcherService();
test.after(() => bounded.configuredRegex.close());
const rules = (pattern, operator = 'REGEX', caseSensitive = false) => ({
    rules: [{ enabled: true, operator: 'AND', responseType: 'XRAY_JSON', conditions: [
        { headerName: 'user-agent', operator, value: pattern, caseSensitive },
    ] }],
});

test('case-insensitive regex preserves escapes and evaluates only with the i flag', async () => {
    for (const [pattern, value, expected] of [
        ['^\\D+$', 'Client', true], ['^\\D+$', '123', false],
        ['^\\S+$', 'Client', true], ['^\\S+$', ' ', false],
        ['^\\W+$', '?!', true], ['^\\W+$', 'Client', false],
        ['^Client$', 'CLIENT', true],
    ]) {
        assert.equal((await matcher.matchRules(rules(pattern), { 'user-agent': value })).matched,
            expected, `${pattern} with ${JSON.stringify(value)}`);
        assert.equal((await matcher.matchRules(rules(pattern, 'NOT_REGEX'), { 'user-agent': value })).matched,
            !expected, `NOT_REGEX ${pattern}`);
    }
    assert.equal((await matcher.matchRules(rules('^Client$', 'REGEX', true), { 'user-agent': 'CLIENT' })).matched, false);
});

test('a hostile header cannot leave the main API thread inside regex backtracking', () => {
    const fixture = `
        const load = require(${JSON.stringify(path.join(__dirname, 'load-typescript.cjs'))});
        const constants = require(${JSON.stringify(path.join(__dirname, '../libs/contract/build/backend/constants'))});
        const bounded = load(${JSON.stringify(path.join(__dirname, '../src/common/utils/bounded-regex.ts'))});
        const { ResponseRulesMatcherService } = load(${JSON.stringify(path.join(__dirname,
            '../src/modules/subscription-response-rules/services/response-rules-matcher.service.ts'))},
            { '@libs/contracts/constants': constants, '@common/utils/bounded-regex': bounded });
        (async () => {
            let responsive = false;
            setTimeout(() => responsive = true, 10);
            const result = await new ResponseRulesMatcherService().matchRules(
                ${JSON.stringify(rules('^(a+)+$', 'NOT_REGEX', true))}, { 'user-agent': 'a'.repeat(100) + '!' });
            if (!responsive || result.responseType !== 'BLOCK') throw new Error('Unsafe regex must fail closed without blocking timers');
            await bounded.configuredRegex.close();
            console.log('bounded');
        })().catch(() => process.exitCode = 1);
    `;
    const result = spawnSync(process.execPath, ['-e', fixture], { timeout: 3000, encoding: 'utf8' });
    assert.equal(result.error?.code, undefined, 'the isolated reproduction exceeded its hard timeout');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /bounded/);
});

test('invalid and oversized expressions fail closed before a permissive fallback', async () => {
    for (const pattern of ['[', 'a'.repeat(2049)]) {
        const config = rules(pattern, 'NOT_REGEX');
        config.rules.push({ enabled: true, operator: 'OR', responseType: 'BROWSER', conditions: [] });
        const result = await matcher.matchRules(config, { 'user-agent': 'Client' });
        assert.equal(result.responseType, 'BLOCK');
    }
});

test('regex pool bounds concurrency, admission and recovery after a timeout', async () => {
    const pool = new bounded.BoundedRegexPool(2, 4, 50, 1000);
    try {
        const tasks = Array.from({ length: 12 }, () => pool.test('^(a+)+$', 'a'.repeat(100) + '!'));
        assert.equal(pool.workers, 2);
        assert.equal(pool.pending, 4);
        assert((await Promise.allSettled(tasks)).every(result => result.status === 'rejected'));
        assert.equal(await pool.test('^Client$', 'Client'), true);
        assert.equal(pool.pending, 0);
        assert(pool.workers <= 2);
    } finally { await pool.close(); }
    await assert.rejects(pool.test('x', 'x'), bounded.RegexBudgetError);
});

test('regex evaluation shares an absolute deadline instead of resetting it per condition', async () => {
    const pool = new bounded.BoundedRegexPool(1, 4, 1000, 1000);
    try {
        assert.equal(await pool.test('^Client$', 'Client'), true);
        const deadline = Date.now() + 40;
        await assert.rejects(pool.test('^(a+)+$', 'a'.repeat(100) + '!', '', deadline), bounded.RegexBudgetError);
        await assert.rejects(pool.test('^Client$', 'Client', '', deadline), bounded.RegexBudgetError);
    } finally { await pool.close(); }
});

test('subscription injector uses the same bounded regex for remarks and tags', async () => {
    const { XrayJsonGeneratorService } = load(path.join(__dirname,
        '../src/modules/subscription-template/generators/xray-json.generator.service.ts'), {
        '@common/utils': {},
        '@common/utils/bounded-regex': bounded,
        '../host-mapper': {},
    });
    const generator = new XrayJsonGeneratorService({});
    const host = { finalRemark: 'recipient', metadata: { uuid: 'r', isHidden: false, tags: ['LTE'] } };
    const hidden = { finalRemark: 'LTE', metadata: { uuid: 'h', isHidden: true, tags: ['LTE'] } };
    for (const type of ['remarkRegex', 'tagRegex']) {
        assert.deepEqual(await generator.resolveHosts({ type, pattern: '^LTE$' }, 'HIDDEN', host, [host, hidden], Date.now() + 1000), [hidden]);
        const hostile = { ...hidden, finalRemark: 'a'.repeat(100) + '!', metadata: { ...hidden.metadata, tags: ['a'.repeat(100) + '!'] } };
        await assert.rejects(generator.resolveHosts({ type, pattern: '^(a+)+$' }, 'HIDDEN', host, [host, hostile], Date.now() + 1000), bounded.RegexBudgetError);
    }
});
