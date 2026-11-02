import { font8x8 } from './font8x8';

const WIDTH = 128;
const HEIGHT = 64;
const CHAR_WIDTH = 8;
const CHAR_HEIGHT = 8;

// Diacritic mappings (NFD combining marks) for Vietnamese
// Format: U+XXXX -> 8-byte array representing rows
const diacritics = {
  '\u0300': [12, 24, 0, 0, 0, 0, 0, 0],   // Grave `
  '\u0301': [48, 24, 0, 0, 0, 0, 0, 0],   // Acute ´
  '\u0302': [24, 36, 0, 0, 0, 0, 0, 0],   // Circumflex ^
  '\u0303': [24, 48, 0, 0, 0, 0, 0, 0],   // Tilde ~
  '\u0309': [24, 16, 8, 0, 0, 0, 0, 0],   // Hook above ̉
  '\u0306': [36, 24, 0, 0, 0, 0, 0, 0],   // Breve ̆
  '\u031b': [0, 64, 96, 0, 0, 0, 0, 0],   // Horn ̛
  '\u0323': [0, 0, 0, 0, 0, 0, 0, 24],   // Underdot ̣
};

/**
 * Resolves or synthesizes a glyph for a given character.
 * Supports standard ASCII and Vietnamese characters with diacritics.
 */
function getGlyphForChar(char) {
  // Special cases for d/D with stroke (đ/Đ)
  if (char === 'đ') {
    const baseGlyph = font8x8[100]; // 'd'
    if (!baseGlyph) return font8x8[63];
    const stroke = [0, 0, 112, 0, 0, 0, 0, 0];
    return baseGlyph.map((b, i) => b | stroke[i]);
  }
  if (char === 'Đ') {
    const baseGlyph = font8x8[68]; // 'D'
    if (!baseGlyph) return font8x8[63];
    const stroke = [0, 0, 0, 14, 0, 0, 0, 0];
    return baseGlyph.map((b, i) => b | stroke[i]);
  }

  // Decompose using NFD to separate base character and diacritics
  const decomposed = char.normalize('NFD');
  const baseCode = decomposed.charCodeAt(0);

  // If base character is not ASCII, fallback to '?'
  if (baseCode < 0 || baseCode >= 128) {
    return font8x8[63]; // '?'
  }

  const baseGlyph = font8x8[baseCode];
  if (!baseGlyph) {
    return font8x8[63]; // '?'
  }

  // Clone base glyph and apply diacritics
  const glyph = [...baseGlyph];
  for (let i = 1; i < decomposed.length; i++) {
    const mark = decomposed[i];
    const markGlyph = diacritics[mark];
    if (markGlyph) {
      for (let r = 0; r < 8; r++) {
        glyph[r] |= markGlyph[r];
      }
    }
  }

  return glyph;
}

/**
 * Renders standard ASCII and Vietnamese text onto a 128x64 monochrome buffer
 * and returns it as a 2048-character Hex string representing XBM format (LSB-first).
 * Supports scaling (1 for 1x, 2 for 2x).
 */
export function renderTextToXbmHex(text, scale = 2) {
  // Normalize text to NFC form to count characters correctly (single code point per character)
  const nfcText = (text || '').normalize('NFC');

  // Normalize scale to 1 or 2
  const s = (scale === 1 || scale === 2) ? scale : 2;

  // 1. Initialize 1024-byte buffer (all 0s, representing empty pixels)
  const buffer = new Uint8Array(1024);


  // Helper to set a pixel at (x, y)
  // XBM format convention: horizontal scan, LSB-first
  function setPixel(x, y) {
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
    const byteIndex = y * 16 + Math.floor(x / 8);
    const bitIndex = x % 8;
    buffer[byteIndex] |= (1 << bitIndex);
  }

  // Calculated sizes based on scale
  const charWidth = CHAR_WIDTH * s;   // 8 or 16
  const charHeight = CHAR_HEIGHT * s; // 8 or 16
  const cols = WIDTH / charWidth;     // 16 or 8
  const rows = HEIGHT / charHeight;   // 8 or 4

  // 2. Wrap text into lines of max characters per row
  const rawLines = nfcText.split('\n');
  const lines = [];

  for (const rawLine of rawLines) {
    if (rawLine.length === 0) {
      lines.push('');
      continue;
    }
    // Split long lines into chunks of characters
    for (let i = 0; i < rawLine.length; i += cols) {
      lines.push(rawLine.substring(i, i + cols));
    }
  }

  // Limit to maximum lines for this scale
  const linesToDraw = lines.slice(0, rows);

  // 3. Draw each character onto the buffer
  for (let r = 0; r < linesToDraw.length; r++) {
    const line = linesToDraw[r];
    const yOffset = r * charHeight;

    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      const glyph = getGlyphForChar(char);
      if (!glyph) continue;

      const xOffset = c * charWidth;

      // Draw the glyph (LSB-first encoding in font8x8 table)
      for (let row = 0; row < CHAR_HEIGHT; row++) {
        const rowByte = glyph[row];
        for (let col = 0; col < CHAR_WIDTH; col++) {
          const bit = (rowByte >> col) & 1;
          if (bit === 1) {
            // Draw pixel block of size s x s
            if (s === 1) {
              setPixel(xOffset + col, yOffset + row);
            } else {
              // Scale = 2
              setPixel(xOffset + col * 2, yOffset + row * 2);
              setPixel(xOffset + col * 2 + 1, yOffset + row * 2);
              setPixel(xOffset + col * 2, yOffset + row * 2 + 1);
              setPixel(xOffset + col * 2 + 1, yOffset + row * 2 + 1);
            }
          }
        }
      }
    }
  }

  // 4. Convert the 1024 bytes buffer into a 2,048 characters Hex string
  let hexString = '';
  for (let i = 0; i < buffer.length; i++) {
    hexString += buffer[i].toString(16).padStart(2, '0');
  }
  return hexString.toUpperCase();
}

