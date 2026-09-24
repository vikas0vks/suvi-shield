import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'src', 'assets', 'icon.svg');
const output = path.join(root, 'src', 'assets');

await mkdir(output, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await sharp(source).resize(size, size).png().toFile(path.join(output, `icon-${size}.png`));
}

console.log('Generated 16, 32, 48 and 128 px extension icons.');
