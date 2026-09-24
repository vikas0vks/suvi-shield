import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build, context } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'src');
const out = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(src, 'manifest.json'), 'utf8'));
manifest.version = packageJson.version;
await writeFile(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const copyPaths = [
  ['popup/popup.html', 'popup/popup.html'],
  ['popup/popup.css', 'popup/popup.css'],
  ['options/options.html', 'options/options.html'],
  ['options/options.css', 'options/options.css'],
  ['injected/youtube-player.css', 'injected/youtube-player.css'],
  ['rules', 'rules'],
  ['generated', 'generated'],
  ['assets', 'assets']
];

for (const [from, to] of copyPaths) {
  await cp(path.join(src, from), path.join(out, to), { recursive: true });
}

const buildOptions = {
  absWorkingDir: root,
  bundle: true,
  charset: 'utf8',
  entryPoints: {
    'background/service-worker': 'src/background/service-worker.ts',
    'content/content': 'src/content/content.ts',
    'injected/main-world': 'src/injected/main-world.ts',
    'injected/fingerprint-world': 'src/injected/fingerprint-world.ts',
    'injected/capability-world': 'src/injected/capability-world.ts',
    'injected/youtube-player': 'src/injected/youtube-player.ts',
    'popup/popup': 'src/popup/popup.ts',
    'options/options': 'src/options/options.ts'
  },
  entryNames: '[dir]/[name]',
  format: 'esm',
  legalComments: 'none',
  minify: !watch,
  outdir: out,
  platform: 'browser',
  sourcemap: watch ? 'inline' : false,
  target: ['chrome120']
};

if (watch) {
  const ctx = await context(buildOptions);
  await ctx.watch();
  console.log('Watching extension sources...');
} else {
  await build(buildOptions);
  console.log(`Built Suvi Shield ${packageJson.version} into ${out}`);
}
