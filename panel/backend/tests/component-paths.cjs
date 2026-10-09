const fs = require('node:fs');
const path = require('node:path');
const combined = path.resolve(__dirname, '../../../node');
const original = path.resolve(__dirname, '../../node-3.4.1');
module.exports.nodeSource = process.env.REMNACUST_NODE_SOURCE || (
    fs.existsSync(path.join(combined, 'package.json'))
        ? combined
        : fs.existsSync(path.join(original, 'package.json'))
            ? original
            : path.resolve(__dirname, '../../../../Remnacust-node/node')
);
