// Crops and colour-grades the raw studio phone photos into consistent full-bleed backdrops.
// Run: node scripts/grade-backdrops.mjs  → writes public/images/bg/*.jpg
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SRC = 'public/images';
const OUT = 'public/images/bg';
const WIDTH = 2560;

// Crop boxes are fractions of the auto-rotated photo: [left, top, right, bottom].
// They cut away cables, chairs, fans and shelf clutter around each subject.
const SHOTS = [
  { name: 'mat', file: 'portfolio-architecture-v3.png', crop: [0.05, 0.14, 1.0, 0.68] },
  { name: 'lattice', file: 'portfolio-industrial-v3.png', crop: [0.06, 0.3, 0.94, 0.78] },
  { name: 'tags', file: 'portfolio-figure-v3.png', crop: [0.0, 0.36, 1.0, 0.84] },
  { name: 'stand', file: 'portfolio-art-v3.png', crop: [0.02, 0.38, 0.88, 0.82] },
  { name: 'shelf', file: 'portfolio-medical-v3.png', crop: [0.12, 0.26, 0.88, 0.7] },
];

// Soft film look: muted colour, lifted blacks, slightly warm highlights.
const WARM = [
  [1.04, 0.02, 0],
  [0.01, 1.0, 0.01],
  [0, 0.02, 0.94],
];

function vignette(w, h) {
  return Buffer.from(
    `<svg width="${w}" height="${h}"><defs><radialGradient id="v" cx="50%" cy="50%" r="75%">` +
      `<stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.55"/>` +
      `</radialGradient></defs><rect width="100%" height="100%" fill="url(#v)"/></svg>`
  );
}

async function grain(w, h) {
  return sharp({ create: { width: w, height: h, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 28 } } })
    .greyscale()
    .ensureAlpha(0.07)
    .png()
    .toBuffer();
}

await mkdir(OUT, { recursive: true });

for (const shot of SHOTS) {
  const oriented = await sharp(`${SRC}/${shot.file}`).rotate().toBuffer({ resolveWithObject: true });
  const { width, height } = oriented.info;
  const [l, t, r, b] = shot.crop;
  const region = {
    left: Math.round(l * width),
    top: Math.round(t * height),
    width: Math.round((r - l) * width),
    height: Math.round((b - t) * height),
  };

  const base = await sharp(oriented.data)
    .extract(region)
    .resize({ width: WIDTH, withoutEnlargement: true })
    .modulate({ saturation: 0.72, brightness: 1.02 })
    .recomb(WARM)
    .linear(0.9, 14)
    .toBuffer({ resolveWithObject: true });

  const { width: w, height: h } = base.info;
  await sharp(base.data)
    .composite([
      { input: vignette(w, h), blend: 'over' },
      { input: await grain(w, h), blend: 'overlay' },
    ])
    .jpeg({ quality: 82, mozjpeg: true, progressive: true })
    .toFile(`${OUT}/${shot.name}.jpg`);

  console.log(`${shot.name}.jpg ${w}x${h}`);
}
