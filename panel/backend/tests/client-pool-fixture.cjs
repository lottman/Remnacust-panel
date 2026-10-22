const path = require('node:path');
const load = require('./load-typescript.cjs');
const root = path.join(__dirname, '..');
const schema = load(
    path.join(root, 'libs/contract/models/xray-json-advanced/remnawave-injector.schema.ts'),
);
const regex = load(path.join(root, 'src/common/utils/bounded-regex.ts'));
const mocks = { '@libs/contracts/models': schema, '@common/utils/bounded-regex': regex };
const pool = load(
    path.join(root, 'src/modules/subscription-template/generators/client-pool.ts'),
    mocks,
);
module.exports = { pool, mocks, schema, regex };
