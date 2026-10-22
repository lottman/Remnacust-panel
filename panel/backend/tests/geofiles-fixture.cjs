const vint = (number) => {
    const bytes = [];
    do {
        const byte = number & 127;
        number = Math.floor(number / 128);
        bytes.push(byte | (number ? 128 : 0));
    } while (number);
    return Buffer.from(bytes);
};
const bytes = (field, value) => {
    value = Buffer.isBuffer(value) ? value : Buffer.from(value);
    return Buffer.concat([vint(field * 8 + 2), vint(value.length), value]);
};
const number = (field, value) => Buffer.concat([vint(field * 8), vint(value)]);
const domain = (type, value, attribute) =>
    Buffer.concat([
        number(1, type),
        bytes(2, value),
        ...(attribute ? [bytes(3, Buffer.concat([bytes(1, attribute), number(2, 1)]))] : []),
    ]);
const geoip = Buffer.concat([
    bytes(
        1,
        Buffer.concat([
            bytes(1, 'RU'),
            bytes(2, Buffer.concat([bytes(1, Buffer.from([203, 0, 113, 0])), number(2, 24)])),
        ]),
    ),
]);
const geosite = bytes(
    1,
    Buffer.concat([
        bytes(1, 'EXAMPLE'),
        bytes(2, domain(2, 'example.com')),
        bytes(2, domain(3, 'ads.example.com', 'ads')),
    ]),
);
module.exports = { vint, bytes, number, domain, geoip, geosite };
