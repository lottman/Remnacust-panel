const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { decideDomainAccess, cdnRequestProof, DomainAccessRequestSchema } = load(
    path.join(__dirname, '../src/common/utils/subscription-domain-access.ts'),
);
const { cdnRequestHeaderName, consumeCdnSelector } = load(
    path.join(__dirname, '../src/common/utils/cdn-request-header.ts'),
);
const secret = 'isolated-test-installation-secret';
const primary = {
    uuid: '11111111-1111-4111-8111-111111111111',
    domain: 'sub.example.test',
    path: '',
    kind: 'PRIMARY',
    parentUuid: null,
    isDefault: true,
    accessMode: 'CDN_ONLY',
    redirectDomainUuid: null,
};
const cdn = {
    uuid: '22222222-2222-4222-8222-222222222222',
    domain: 'cdn.example.test',
    path: '',
    kind: 'CDN',
    parentUuid: primary.uuid,
    isDefault: false,
    accessMode: 'OPEN',
};
const cdn2 = { ...cdn, uuid: '33333333-3333-4333-8333-333333333333', domain: 'edge.example.test' };
const rows = [primary, cdn, cdn2];
const request = { host: primary.domain, url: '/shortuuid/json', method: 'GET' };
const proof = (row) => ({
    uuid: row.uuid,
    name: cdnRequestHeaderName(row.uuid, secret).toLowerCase(),
    proof: cdnRequestProof(row.uuid, secret),
});
const decide = (input, domains = rows) =>
    decideDomainAccess(domains, { ...request, ...input }, secret);

test('origin-only access cannot be unlocked by a public UUID, Host, legacy path or selector name', () => {
    for (const input of [
        {},
        { host: cdn.domain },
        { uuid: cdn.uuid },
        { uuid: cdn.uuid, name: proof(cdn).name },
        { host: 'unregistered.example.test' },
        { url: `/cdn/${cdn.uuid}/shortuuid/json`, uuid: cdn.uuid },
    ])
        assert.equal(decide(input).action, 'block');
});
test('each CDN key authenticates only its own name and ID; a different installation is rejected', () => {
    for (const row of [cdn, cdn2]) {
        const input = proof(row);
        assert.equal(decide(input).authenticated, true);
        for (const other of [
            { ...input, uuid: row === cdn ? cdn2.uuid : cdn.uuid },
            { ...input, name: proof(row === cdn ? cdn2 : cdn).name },
            { ...input, proof: cdnRequestProof(row.uuid, 'different-installation') },
            { ...input, proof: '0'.repeat(64) },
        ])
            assert.equal(decide(other).action, 'block');
    }
});
test('keys and names are unique for 1000 domains and domain separated from one another', () => {
    const names = new Set(),
        values = new Set();
    for (let i = 0; i < 1000; i++) {
        const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
        names.add(cdnRequestHeaderName(id, secret));
        values.add(cdnRequestProof(id, secret));
    }
    assert.equal(names.size, 1000);
    assert.equal(values.size, 1000);
});
test('a valid proof cannot cross a known primary family or sibling public hostname', () => {
    assert.equal(decide({ ...proof(cdn), host: cdn2.domain }).action, 'block');
    const other = {
        ...primary,
        uuid: '44444444-4444-4444-8444-444444444444',
        domain: 'other.example.test',
        isDefault: false,
    };
    assert.equal(decide({ ...proof(cdn), host: other.domain }, [...rows, other]).action, 'block');
});
test('origin host rewriting and internal API addresses work only with valid CDN proof', () => {
    for (const host of [primary.domain, cdn.domain, '127.0.0.1:3000', 'backend:3000']) {
        assert.equal(decide({ ...proof(cdn), host }).action, 'allow');
        assert.equal(decide({ host }).action, 'block');
    }
});
test('existing OPEN domains keep plain and legacy CDN links working, without pretending they are authenticated', () => {
    const open = [{ ...primary, accessMode: 'OPEN' }, cdn];
    for (const input of [{}, { uuid: cdn.uuid }, { host: cdn.domain }, proof(cdn)])
        assert.equal(decide(input, open).action, 'allow');
    assert.equal(decide({ uuid: cdn.uuid }, open).authenticated, undefined);
});
for (const url of [
    '/key',
    '/key/json',
    '/key/device/token/json?type=x',
    '/geofiles/id/bundles/selection/bundle.dat?revision=4',
    '/geofiles/id/bundle.dat.sha256',
]) {
    test('redirect retains subscription or file path: ' + url, () => {
        const decision = decide({ url }, [
            { ...primary, accessMode: 'REDIRECT', redirectDomainUuid: cdn.uuid },
            cdn,
        ]);
        assert.equal(decision.location, 'https://' + cdn.domain + url);
    });
}
test('prefixes are mapped once and API delivery maps to the public path', () => {
    const prefixed = [
        { ...primary, path: '/origin', accessMode: 'REDIRECT', redirectDomainUuid: cdn.uuid },
        { ...cdn, path: '/edge' },
    ];
    assert.equal(
        decide({ url: '/origin/key/json?a=1' }, prefixed).location,
        'https://cdn.example.test/edge/key/json?a=1',
    );
    assert.equal(
        decide({ url: '/api/sub/key/json?a=1', api: true }, prefixed).location,
        'https://cdn.example.test/edge/key/json?a=1',
    );
    assert.equal(decide({ url: '/unexpected/key' }, prefixed).action, 'block');
});
test('redirect cannot loop or target another family, an absent domain or PRIMARY', () => {
    const redirect = { ...primary, accessMode: 'REDIRECT', redirectDomainUuid: cdn.uuid };
    for (const input of [{ host: cdn.domain }, { uuid: cdn.uuid }])
        assert.equal(decide(input, [redirect, cdn]).action, 'block');
    assert.equal(decide(proof(cdn), [redirect, cdn]).action, 'allow');
    for (const redirectDomainUuid of [primary.uuid, '00000000-0000-4000-8000-000000000000'])
        assert.equal(decide({}, [{ ...redirect, redirectDomainUuid }, cdn]).action, 'block');
});
test('redirect injection, traversal, encoded CRLF and protocol relative paths are rejected', () => {
    const domains = [{ ...primary, accessMode: 'REDIRECT', redirectDomainUuid: cdn.uuid }, cdn];
    for (const url of [
        '//evil.test/key',
        '/\\evil.test',
        '/a/../key',
        '/%2e%2e/key',
        '/%252e%252e/key',
        '/key#fragment',
        '/key\r\nLocation:x',
        '/%0d%0a/key',
        '/%zz',
    ])
        assert.equal(decide({ url }, domains).action, 'block', JSON.stringify(url));
    const preserved = decide({ url: '/key/json?next=https://evil.test' }, domains);
    assert.equal(new URL(preserved.location).host, cdn.domain);
});
test('wire parser consumes a signed header and strips it, rejects malformed and conflicting values', () => {
    const selected = proof(cdn);
    const headers = { [selected.name]: cdn.uuid + '.' + selected.proof, 'user-agent': 'fixture' };
    assert.deepEqual(consumeCdnSelector(headers), { ...selected, invalid: false });
    assert.deepEqual(headers, { 'user-agent': 'fixture' });
    for (const value of [
        cdn.uuid + '.',
        cdn.uuid + '.wrong',
        cdn.uuid + '.' + selected.proof + '.extra',
    ])
        assert.equal(consumeCdnSelector({ [selected.name]: value }).invalid, true);
    assert.equal(
        consumeCdnSelector({ 'x-remnacust-cdn': cdn.uuid + '.' + selected.proof }).invalid,
        true,
    );
});
test('public policy input is bounded, strict and does not accept arbitrary request headers', () => {
    assert.equal(DomainAccessRequestSchema.safeParse(request).success, true);
    for (const input of [
        { ...request, url: '/' + 'x'.repeat(8192) },
        { ...request, method: 'POST' },
        { ...request, headers: { authorization: 'x' } },
        { ...request, proof: 'a' },
    ])
        assert.equal(DomainAccessRequestSchema.safeParse(input).success, false);
});

test('mixed signed and unsigned selectors are rejected regardless of header order', () => {
    const signed = { [proof(cdn).name]: cdn.uuid + '.' + proof(cdn).proof };
    for (const headers of [
        { ...signed, 'x-remnacust-cdn': cdn.uuid },
        { 'x-remnacust-cdn': cdn.uuid, ...signed },
    ])
        assert.equal(consumeCdnSelector(headers).invalid, true);
});
