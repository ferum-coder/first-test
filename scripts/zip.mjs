// Packs the CONTENTS of site/ (incl. .htaccess) into dist/iskra-site.zip.
// Run: npm run zip            — fails while the __FORM_URL__ placeholder is still in site/
//      npm run zip -- --allow-placeholder   — test build with the placeholder
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZipArchive } from 'archiver';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');
const out = join(root, 'dist', 'iskra-site.zip');
const allowPlaceholder = process.argv.includes('--allow-placeholder');

async function filesWithPlaceholder(dir) {
  const hits = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) hits.push(...await filesWithPlaceholder(p));
    else if (/\.(html|js|css|json|txt|xml)$/.test(entry.name) && (await readFile(p, 'utf8')).includes('__FORM_URL__')) hits.push(p);
  }
  return hits;
}

const hits = await filesWithPlaceholder(site);
if (hits.length && !allowPlaceholder) {
  console.error('✗ __FORM_URL__ is still in:', hits.map((h) => h.slice(root.length + 1)).join(', '));
  console.error('  Put the Google Form link into site/index.html, or use: npm run zip -- --allow-placeholder');
  process.exit(1);
}
if (hits.length) console.warn('! building with the __FORM_URL__ placeholder (test build)');

await mkdir(dirname(out), { recursive: true });
const archive = new ZipArchive({ zlib: { level: 9 } });
const stream = createWriteStream(out);
const done = new Promise((resolve, reject) => { stream.on('close', resolve); archive.on('error', reject); });
archive.pipe(stream);
archive.glob('**/*', { cwd: site, dot: true, ignore: ['**/*.zip'] }); // never nest old archives
await archive.finalize();
await done;
console.log(`✓ ${out.slice(root.length + 1)} — ${(archive.pointer() / 1024).toFixed(1)} KB`);
