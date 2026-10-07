const fs = require('node:fs');
const path = require('node:path');
const combined = path.resolve(__dirname, '../../../node');
module.exports.nodeSource = process.env.REMNACUST_NODE_SOURCE || (
    fs.existsSync(path.join(combined, 'package.json'))
        ? combined
        : path.resolve(__dirname, '../../../../Remnacust-node/node')
);
