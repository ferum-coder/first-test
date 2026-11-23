// Builds site/data/sky.json from d3-celestial data (BSD-3-Clause, Olaf Frohn).
// Run: node scripts/build-stars.mjs
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'site', 'data', 'sky.json');
const CREDITS = join(root, 'site', 'CREDITS.txt');
const MAG_LIMIT = Number(process.env.MAG_LIMIT ?? 6.0);
const CONSTELLATIONS = ['UMa', 'UMi', 'Cas', 'Ori', 'Cyg', 'Lyr'];
const SOURCES = [
  'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/',
  'https://cdn.jsdelivr.net/gh/ofrohn/d3-celestial@master/data/',
];

async function fetchJson(file) {
  let lastErr;
  for (const base of SOURCES) {
    try {
      const res = await fetch(base + file);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      console.warn(`! ${base}${file}: ${e.message}`);
    }
  }
  throw new Error(`Cannot download ${file}: ${lastErr?.message}`);
}

const r2 = (x) => Math.round(x * 100) / 100;
const normRa = (lon) => ((lon % 360) + 360) % 360;

function assertCollection(json, name) {
  if (json?.type !== 'FeatureCollection' || !Array.isArray(json.features)) {
    throw new Error(`${name}: unexpected structure (not a GeoJSON FeatureCollection)`);
  }
}

function angDist(ra1, de1, ra2, de2) {
  const d = Math.PI / 180;
  const c = Math.sin(de1 * d) * Math.sin(de2 * d) +
    Math.cos(de1 * d) * Math.cos(de2 * d) * Math.cos((ra1 - ra2) * d);
  return Math.acos(Math.min(1, Math.max(-1, c))) / d;
}

const starsJson = await fetchJson('stars.6.json');
const linesJson = await fetchJson('constellations.lines.json');
assertCollection(starsJson, 'stars.6.json');
assertCollection(linesJson, 'constellations.lines.json');

const stars = [];
for (const f of starsJson.features) {
  const [lon, lat] = f.geometry?.coordinates ?? [];
  const mag = Number(f.properties?.mag);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || !Number.isFinite(mag)) continue;
  if (mag > MAG_LIMIT) continue;
  let bv = Number.parseFloat(f.properties?.bv);
  if (!Number.isFinite(bv)) bv = 0.6;
  stars.push([r2(normRa(lon)), r2(lat), r2(mag), r2(bv)]);
}
stars.sort((a, b) => a[2] - b[2]);

const lines = {};
for (const id of CONSTELLATIONS) {
  const f = linesJson.features.find((x) => x.id === id);
  if (!f || f.geometry?.type !== 'MultiLineString') throw new Error(`No lines for ${id}`);
  lines[id] = f.geometry.coordinates.map((seg) => seg.map(([lon, lat]) => [r2(normRa(lon)), r2(lat)]));
}

// Sanity checks: Polaris and Vega must be present where they belong.
const near = (ra, de, maxMag) => stars.some((s) => s[2] < maxMag && angDist(s[0], s[1], ra, de) < 0.5);
if (!near(37.95, 89.26, 2.2)) throw new Error('Sanity check failed: Polaris not found');
if (!near(279.23, 38.78, 0.3)) throw new Error('Sanity check failed: Vega not found');

const credits = 'Star and constellation data: d3-celestial by Olaf Frohn, BSD-3-Clause (https://github.com/ofrohn/d3-celestial)';
const out = { v: 1, stars, lines, credits };
await mkdir(dirname(OUT), { recursive: true });
const text = JSON.stringify(out);
await writeFile(OUT, text);

let creditsText = '';
try { creditsText = await readFile(CREDITS, 'utf8'); } catch {}
if (!creditsText.includes('d3-celestial')) {
  creditsText += `${credits}\n`;
  await writeFile(CREDITS, creditsText);
}

console.log(`sky.json: ${stars.length} stars (mag <= ${MAG_LIMIT}), ${CONSTELLATIONS.length} constellations, ${(text.length / 1024).toFixed(1)} KB`);
if (text.length > 160 * 1024) console.warn('! sky.json exceeds 160 KB budget — lower MAG_LIMIT (e.g. MAG_LIMIT=5.8)');
