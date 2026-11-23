// Copies logo, favicons, OG image and Manrope fonts into site/.
// Run: node scripts/copy-assets.mjs
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');

const copies = [
  ['logo/svg/iskra-logo-short-white.svg', 'logo/svg/iskra-logo-short-white.svg'],
  ['logo/favicon', 'logo/favicon'],
  ['logo/social/og-image.png', 'logo/social/og-image.png'],
  ['node_modules/@fontsource-variable/manrope/files/manrope-cyrillic-wght-normal.woff2', 'fonts/manrope-cyrillic.woff2'],
  ['node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2', 'fonts/manrope-latin.woff2'],
];

for (const [from, to] of copies) {
  const dest = join(site, to);
  await mkdir(dirname(dest), { recursive: true });
  await cp(join(root, from), dest, { recursive: true });
  console.log(`copied ${from} -> site/${to}`);
}

const CREDITS = join(site, 'CREDITS.txt');
const line = 'Font: Manrope by Mikhail Sharanda, SIL Open Font License 1.1';
let text = '';
try { text = await readFile(CREDITS, 'utf8'); } catch {}
if (!text.includes('Manrope')) await writeFile(CREDITS, text + line + '\n');
