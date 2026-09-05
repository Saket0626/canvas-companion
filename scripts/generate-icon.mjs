import { deflateSync } from "node:zlib";

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function inRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x >= left + radius && x < right - radius && y >= top && y < bottom) return true;
  if (y >= top + radius && y < bottom - radius && x >= left && x < right) return true;
  const corners = [
    [left + radius, top + radius],
    [right - 1 - radius, top + radius],
    [left + radius, bottom - 1 - radius],
    [right - 1 - radius, bottom - 1 - radius],
  ];
  return corners.some(([cx, cy]) => (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2);
}

/**
 * Canvas-blue calendar glyph. Written as a raw PNG so the repo has no binary
 * asset dependency and `npm run build` always produces a valid 128px icon.
 */
export function generateIconPng(size = 128) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const bg = [3, 116, 181, 255];
  const white = [255, 255, 255, 255];
  const ink = [13, 74, 110, 255];
  const pad = Math.round(size * 0.12);
  const calLeft = pad + Math.round(size * 0.08);
  const calTop = pad + Math.round(size * 0.14);
  const calRight = size - pad - Math.round(size * 0.08);
  const calBottom = size - pad - Math.round(size * 0.06);
  const headerBottom = calTop + Math.round(size * 0.16);
  const ringR = Math.round(size * 0.035);
  const ringY = calTop + Math.round(size * 0.02);

  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      let px = [0, 0, 0, 0];
      if (inRoundedRect(x, y, pad, pad, size - pad, size - pad, Math.round(size * 0.18))) {
        px = bg;
      }
      if (inRoundedRect(x, y, calLeft, calTop, calRight, calBottom, Math.round(size * 0.06))) {
        px = y < headerBottom ? ink : white;
      }
      for (const ringX of [
        calLeft + Math.round((calRight - calLeft) * 0.28),
        calLeft + Math.round((calRight - calLeft) * 0.72),
      ]) {
        const d2 = (x - ringX) ** 2 + (y - ringY) ** 2;
        if (d2 <= (ringR + 1) ** 2) px = white;
        if (d2 <= ringR ** 2 && y < headerBottom) px = ink;
      }
      const cell = Math.round(size * 0.12);
      const gridTop = headerBottom + Math.round(size * 0.08);
      const dots = [
        [calLeft + cell, gridTop + cell, [3, 116, 181]],
        [calLeft + cell * 2.4, gridTop + cell, [230, 126, 34]],
        [calLeft + cell * 3.8, gridTop + cell * 2.2, [39, 174, 96]],
      ];
      for (const [dx, dy, color] of dots) {
        if ((x - dx) ** 2 + (y - dy) ** 2 <= (cell * 0.28) ** 2) {
          px = [...color, 255];
        }
      }
      const i = row + 1 + x * 4;
      raw[i] = px[0];
      raw[i + 1] = px[1];
      raw[i + 2] = px[2];
      raw[i + 3] = px[3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
