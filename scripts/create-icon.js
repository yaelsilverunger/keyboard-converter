'use strict';
// Generates icon.png (256x256) used by electron-builder for the Windows installer.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const [r, g, b] = [90, 79, 232]; // #5a4fe8
const W = 256, H = 256;

const row = Buffer.alloc(W * 3 + 1);
row[0] = 0;
for (let x = 0; x < W; x++) { row[1 + x*3] = r; row[2 + x*3] = g; row[3 + x*3] = b; }
const raw = Buffer.concat(Array.from({ length: H }, () => Buffer.from(row)));
const compressed = zlib.deflateSync(raw);

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) {
    c ^= byte;
    for (let i = 0; i < 8; i++) c = (c & 1) ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type), td = Buffer.concat([t, data]);
  const len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; // bit depth=8, RGB

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', compressed),
  chunk('IEND', Buffer.alloc(0))
]);

const out = path.join(__dirname, '..', 'icon.png');
fs.writeFileSync(out, png);
console.log('Icon generated:', out);
