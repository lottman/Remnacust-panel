const { PrismaClient: Client } = require('@prisma/client');
const { postgresAdapter } = require('./load-typescript.cjs')(require('node:path').join(__dirname, '../src/common/database/postgres-adapter.ts'));

class PrismaClient extends Client {
    constructor(options = {}) {
        const { datasourceUrl, datasources, ...settings } = options;
        super({ ...settings, adapter: postgresAdapter(datasourceUrl ?? datasources?.db?.url) });
    }
}

module.exports = { PrismaClient };
