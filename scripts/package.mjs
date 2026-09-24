import { createWriteStream } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import archiver from 'archiver';

const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const releaseDir = path.join(root, 'release');
const target = path.join(releaseDir, `suvi-shield-${pkg.version}-chromium.zip`);

await mkdir(releaseDir, { recursive: true });

await new Promise((resolve, reject) => {
  const output = createWriteStream(target);
  const archive = archiver('zip', { zlib: { level: 9 } });
  output.on('close', resolve);
  output.on('error', reject);
  archive.on('error', reject);
  archive.pipe(output);
  archive.directory(path.join(root, 'dist'), false);
  void archive.finalize();
});

console.log(`Packaged ${target}`);
