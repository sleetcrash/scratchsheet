// Generates build/icon.png (256x256, electron-builder minimum) with no dependencies: a teal rounded tile with a 3x3 grid.
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

const SIZE = 256;
const K = SIZE / 64; // geometry below was designed on a 64px grid
const px = Buffer.alloc(SIZE * SIZE * 4);

const BG = [0, 0, 0, 0];
const TILE = [20, 184, 166, 255]; // teal
const LINE = [15, 23, 42, 255]; // slate-900
const CELL = [204, 251, 241, 255]; // teal-100

function set(x, y, c) {
  const i = (y * SIZE + x) * 4;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = c[3];
}

const R = 12 * K; // corner radius
function insideTile(x, y) {
  const cx = Math.min(Math.max(x, R), SIZE - 1 - R);
  const cy = Math.min(Math.max(y, R), SIZE - 1 - R);
  return (x - cx) ** 2 + (y - cy) ** 2 <= R * R;
}

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (!insideTile(x, y)) { set(x, y, BG); continue; }
    // grid area: 3 cells of 12 units, lines 1 unit thick
    const gx = x - 14 * K, gy = y - 14 * K;
    if (gx >= 0 && gx <= 36 * K && gy >= 0 && gy <= 36 * K) {
      const onLine = (gx % (12 * K)) < K || (gy % (12 * K)) < K;
      set(x, y, onLine ? LINE : CELL);
    } else {
      set(x, y, TILE);
    }
  }
}

// Mark the first cell as the "active cell"
for (let y = 15 * K; y < 26 * K; y++) for (let x = 15 * K; x < 26 * K; x++) set(x, y, TILE);

// PNG encode
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  px.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = path.join(__dirname, 'icon.png');
fs.writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes');
