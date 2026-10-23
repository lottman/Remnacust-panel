const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('../../backend/tests/load-typescript.cjs');
const { countrySearchIndex, normalizeCountrySearch } = load(path.join(__dirname, '../src/shared/ui/flag-picker/country-search.ts'));

test('country search accepts names in all four UI languages independently of the display language', () => {
    const index = countrySearchIndex(language => ({ en: 'Sark', ru: 'Сарк', fa: 'سارک', zh: '萨克' })[language]);
    for (const query of ['Germany', 'Германия', 'آلمان', '德国', 'de', ' DE ']) {
        assert.ok(index.get('DE').includes(normalizeCountrySearch(query)), query);
    }
    for (const query of ['United States', 'Соединенные Штаты', 'ایالات متحده', '美国', 'US']) {
        assert.ok(index.get('US').includes(normalizeCountrySearch(query)), query);
    }
    for (const query of ['Sark', 'Сарк', 'سارک', '萨克']) assert.ok(index.get('CQ').includes(normalizeCountrySearch(query)), query);
});

test('Persian search tolerates Arabic letter variants, marks and joiners', () => {
    assert.equal(normalizeCountrySearch('پاكستان'), normalizeCountrySearch('پاکستان'));
    assert.equal(normalizeCountrySearch('ايالات\u200cمتحده'), normalizeCountrySearch('ایالاتمتحده'));
    assert.equal(normalizeCountrySearch('Соединённые'), normalizeCountrySearch('Соединенные'));
});
