// Recompress images under public/assets/media in place.
//
// Files in public/ bypass Astro's image pipeline, and Notion posts reference
// them by path, so we keep filenames/formats stable and just shrink them:
// apply EXIF orientation, cap the long edge, re-encode with mozjpeg, and drop
// metadata (including GPS). Already-small files are left alone, so this is
// safe to re-run whenever new photos are added.
//
//   node scripts/optimize-images.mjs
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import sharp from 'sharp';

const ROOT = 'public/assets/media';
const MAX_EDGE = 1800;
const QUALITY = 78;
const SKIP_UNDER = 400 * 1024;

async function* walk(dir) {
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) yield* walk(p);
    else yield p;
  }
}

let before = 0;
let after = 0;
for await (const file of walk(ROOT)) {
  const ext = extname(file).toLowerCase();
  if (!['.jpg', '.jpeg'].includes(ext)) continue;
  const { size } = await stat(file);
  before += size;
  if (size < SKIP_UNDER) {
    after += size;
    continue;
  }
  const out = await sharp(await readFile(file))
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: QUALITY, mozjpeg: true, progressive: true })
    .toBuffer();
  if (out.length < size) {
    await writeFile(file, out);
    after += out.length;
    console.log(`${file}: ${(size / 1e6).toFixed(1)}MB -> ${(out.length / 1e3).toFixed(0)}KB`);
  } else {
    after += size;
  }
}
console.log(`total: ${(before / 1e6).toFixed(1)}MB -> ${(after / 1e6).toFixed(1)}MB`);
