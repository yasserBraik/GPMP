// Reads the real type and size of an uploaded image from its first bytes.
// The file extension and the browser's MIME type can be faked (e.g. an HTML page renamed to
// .png), so poster uploads are only accepted when the bytes really are a PNG, JPEG or WebP image.
//
//   const info = imageInfo(buffer); // -> { type: 'png', mime: 'image/png', width: 1200, height: 1697 } or null

function pngInfo(b) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || !signature.every((byte, i) => b[i] === byte)) return null;
  return { type: 'png', mime: 'image/png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function jpegInfo(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  // Walk the JPEG segments until the "start of frame" segment, which holds the size
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = b.readUInt16BE(i + 2);
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame) {
      return { type: 'jpeg', mime: 'image/jpeg', width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
    }
    i += 2 + length;
  }
  return null;
}

function webpInfo(b) {
  if (b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    return { type: 'webp', mime: 'image/webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { type: 'webp', mime: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    return { type: 'webp', mime: 'image/webp', width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  }
  return null;
}

export function imageInfo(buffer) {
  if (!buffer || buffer.length === 0) return null;
  const info = pngInfo(buffer) || jpegInfo(buffer) || webpInfo(buffer);
  if (!info || info.width <= 0 || info.height <= 0) return null;
  return info;
}
