// Builds the final Iskra logo files: outlined SVGs, PNGs, favicons, palette.
const fs = require("fs");
const path = require("path");
const opentype = require("opentype.js");
const { Resvg } = require("@resvg/resvg-js");
const pngToIco = require("png-to-ico");

const FONTS = process.argv[2];
const OUT = process.argv[3];
const michroma = opentype.loadSync(path.join(FONTS, "Michroma.ttf"));
const manrope = opentype.loadSync(path.join(FONTS, "Manrope.ttf"));

const C = {
  navy: "#0E1B3D", white: "#FFFFFF", night: "#070C24",
  light: "#BFF6FF", cyan: "#2EC5E0", blue: "#6C7CFF", lav: "#A78BFA",
};

// ---------- text → path, with manual tracking ----------
function textPath(font, str, x, y, size, tracking) {
  const scale = size / font.unitsPerEm;
  let cx = x, d = "";
  const glyphs = font.stringToGlyphs(str);
  glyphs.forEach((g, i) => {
    d += g.getPath(cx, y, size).toPathData(2);
    cx += g.advanceWidth * scale + tracking;
    if (i < glyphs.length - 1) cx += font.getKerningValue(g, glyphs[i + 1]) * scale;
  });
  const bb = (() => {
    const p = new opentype.Path(); glyphs.forEach(() => {});
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, px = x;
    glyphs.forEach((g, i) => {
      const b = g.getPath(px, y, size).getBoundingBox();
      if (isFinite(b.x1)) { x0 = Math.min(x0, b.x1); y0 = Math.min(y0, b.y1); x1 = Math.max(x1, b.x2); y1 = Math.max(y1, b.y2); }
      px += g.advanceWidth * scale + tracking;
      if (i < glyphs.length - 1) px += font.getKerningValue(g, glyphs[i + 1]) * scale;
    });
    return { x0, y0, x1, y1 };
  })();
  return { d, bb };
}

// ---------- the mark ----------
const r2 = (n) => Math.round(n * 100) / 100;
function star(cx, cy, r) {
  const k = r * 0.16;
  return `M${r2(cx)},${r2(cy - r)} Q${r2(cx + k)},${r2(cy - k)} ${r2(cx + r)},${r2(cy)} Q${r2(cx + k)},${r2(cy + k)} ${r2(cx)},${r2(cy + r)} Q${r2(cx - k)},${r2(cy + k)} ${r2(cx - r)},${r2(cy)} Q${r2(cx - k)},${r2(cy - k)} ${r2(cx)},${r2(cy - r)}Z`;
}
/** mark centred at (cx,cy), scale s. opts: core colour, glow, sparkles: "all" | "one" | "none" */
function mark(cx, cy, s, { core, glow = true, sparkles = "all", id = "m" }) {
  const ray = "M0,-42 L2.8,-13 L0,-7.5 L-2.8,-13Z";
  let rays = "";
  for (let i = 0; i < 8; i++) rays += `<path d="${ray}" transform="rotate(${i * 45}) scale(${i % 2 ? 0.58 : 1})"/>`;
  const sp = sparkles === "none" ? "" :
    `<path d="${star(33, -31, 5.5)}" fill="${core}" opacity="0.85"/>` +
    (sparkles === "all" ? `<path d="${star(-34, 29, 3.6)}" fill="${core}" opacity="0.6"/><path d="${star(38, 20, 2.4)}" fill="${core}" opacity="0.5"/>` : "");
  return `<g transform="translate(${cx} ${cy}) scale(${s})">
    <defs>
      <radialGradient id="${id}-rays" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="42">
        <stop offset="0" stop-color="${C.light}"/><stop offset="0.38" stop-color="${C.cyan}"/><stop offset="0.75" stop-color="${C.blue}"/><stop offset="1" stop-color="${C.lav}"/>
      </radialGradient>
      <radialGradient id="${id}-glow" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="30">
        <stop offset="0" stop-color="#7FE8FF" stop-opacity="0.55"/><stop offset="1" stop-color="${C.blue}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    ${glow ? `<circle r="30" fill="url(#${id}-glow)"/>` : ""}
    <g fill="url(#${id}-rays)">${rays}</g>
    <circle r="4.2" fill="${core}"/>
    ${sp}
  </g>`;
}
const MARK_R = 44; // visual radius of the mark in its own units (incl. sparkles)

// ---------- lockups ----------
const MX = 56, MY = 56, MS = 1.25;
const word = textPath(michroma, "ISKRA", 140, 70, 50, 12);
const tag = textPath(manrope, "РОБОТОТЕХНІКА · ЕЛЕКТРОНІКА", 143, 104, 15, 4.4);
// short version: wordmark vertically centred on the mark
const wcy = (word.bb.y0 + word.bb.y1) / 2;
const wordShort = textPath(michroma, "ISKRA", 140, 70 + (MY - wcy), 50, 12);

function svgDoc(vb, body, title = "Iskra") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.map(r2).join(" ")}" width="${r2(vb[2])}" height="${r2(vb[3])}" role="img" aria-label="${title}">
<title>${title}</title>
${body}
</svg>
`;
}
function lockup(ink, withTag, id) {
  const pad = 8;
  const mx0 = MX - MARK_R * MS, my0 = MY - MARK_R * MS, my1 = MY + MARK_R * MS;
  const w = withTag ? word : wordShort;
  const x1 = Math.max(w.bb.x1, withTag ? tag.bb.x1 : 0);
  const y0 = Math.min(my0, w.bb.y0), y1 = Math.max(my1, withTag ? tag.bb.y1 : w.bb.y1);
  const vb = [mx0 - pad, y0 - pad, x1 - mx0 + pad * 2, y1 - y0 + pad * 2];
  const body = mark(MX, MY, MS, { core: ink, id }) +
    `\n<path fill="${ink}" d="${w.d}"/>` +
    (withTag ? `\n<path fill="${ink}" fill-opacity="0.72" d="${tag.d}"/>` : "");
  return svgDoc(vb, body);
}
function markOnly(ink, id) {
  const R = MARK_R + 2;
  return svgDoc([-R, -R, R * 2, R * 2], mark(0, 0, 1, { core: ink, id }), "Iskra");
}
function appIcon({ radius = 22, sparkles = "one", glow = false } = {}) {
  // night-sky tile with the mark, used for favicons / app icons
  const body = `<defs><radialGradient id="sky" cx="0.85" cy="0" r="1.1"><stop offset="0" stop-color="#1A2A6B"/><stop offset="0.6" stop-color="${C.night}"/></radialGradient></defs>
<rect width="100" height="100" rx="${radius}" fill="url(#sky)"/>
${mark(50, 50, 0.98, { core: C.white, glow, sparkles, id: "i" })}`;
  return svgDoc([0, 0, 100, 100], body, "Iskra");
}

// ---------- OG / social image with a starfield ----------
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }
function ogImage() {
  const W = 1200, H = 630, rand = rng(4242);
  let stars = "";
  for (let i = 0; i < 420; i++) {
    const m = rand(), r = m > 0.97 ? 1.8 : m > 0.85 ? 1.2 : 0.7;
    stars += `<circle cx="${r2(rand() * W)}" cy="${r2(rand() * H)}" r="${r}" fill="#EAF2FF" fill-opacity="${r2(0.35 + rand() * 0.55)}"/>`;
  }
  const inner = lockup(C.white, true, "og");
  const vb = inner.match(/viewBox="([^"]+)"/)[1].split(" ").map(Number);
  const scale = 860 / vb[2];
  const tx = (W - vb[2] * scale) / 2 - vb[0] * scale, ty = (H - vb[3] * scale) / 2 - vb[1] * scale;
  const content = inner.replace(/^[\s\S]*?<\/title>/, "").replace(/<\/svg>\s*$/, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>
  <radialGradient id="n1" cx="0.85" cy="0.05" r="0.7"><stop offset="0" stop-color="#6C7CFF" stop-opacity="0.38"/><stop offset="1" stop-color="#6C7CFF" stop-opacity="0"/></radialGradient>
  <radialGradient id="n2" cx="0.1" cy="0.95" r="0.6"><stop offset="0" stop-color="#2EC5E0" stop-opacity="0.22"/><stop offset="1" stop-color="#2EC5E0" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="${C.night}"/><rect width="${W}" height="${H}" fill="url(#n1)"/><rect width="${W}" height="${H}" fill="url(#n2)"/>
${stars}
<g transform="translate(${r2(tx)} ${r2(ty)}) scale(${r2(scale)})">${content}</g>
</svg>
`;
}

// ---------- write ----------
const dirs = ["svg", "png", "favicon", "social"].map((d) => path.join(OUT, d));
dirs.forEach((d) => fs.mkdirSync(d, { recursive: true }));
const svgs = {
  "svg/iskra-logo.svg": lockup(C.navy, true, "a"),
  "svg/iskra-logo-white.svg": lockup(C.white, true, "b"),
  "svg/iskra-logo-short.svg": lockup(C.navy, false, "c"),
  "svg/iskra-logo-short-white.svg": lockup(C.white, false, "d"),
  "svg/iskra-mark.svg": markOnly(C.navy, "e"),
  "svg/iskra-mark-white.svg": markOnly(C.white, "f"),
  "favicon/favicon.svg": appIcon(),
  "social/og-image.svg": ogImage(),
};
for (const [f, s] of Object.entries(svgs)) fs.writeFileSync(path.join(OUT, f), s);

const render = (svg, width, file) => {
  const png = new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
  fs.writeFileSync(path.join(OUT, file), png);
  return png;
};
render(svgs["svg/iskra-logo.svg"], 2000, "png/iskra-logo.png");
render(svgs["svg/iskra-logo-white.svg"], 2000, "png/iskra-logo-white.png");
render(svgs["svg/iskra-logo-short.svg"], 1600, "png/iskra-logo-short.png");
render(svgs["svg/iskra-logo-short-white.svg"], 1600, "png/iskra-logo-short-white.png");
render(svgs["svg/iskra-mark.svg"], 1024, "png/iskra-mark.png");
render(svgs["svg/iskra-mark-white.svg"], 1024, "png/iskra-mark-white.png");
render(svgs["social/og-image.svg"], 1200, "social/og-image.png");

// social avatar (square, glow + all sparkles, no rounded corners: platforms crop to a circle)
const avatar = appIcon({ radius: 0, sparkles: "all", glow: true });
fs.writeFileSync(path.join(OUT, "social/avatar.svg"), avatar);
render(avatar, 1024, "social/avatar.png");

const ico = [];
for (const s of [16, 32, 48]) {
  const icon = s <= 16 ? appIcon({ sparkles: "none" }) : appIcon();
  ico.push(render(icon, s, `favicon/favicon-${s}.png`));
}
render(svgs["favicon/favicon.svg"], 180, "favicon/apple-touch-icon.png");
render(svgs["favicon/favicon.svg"], 192, "favicon/icon-192.png");
render(svgs["favicon/favicon.svg"], 512, "favicon/icon-512.png");
pngToIco(ico.map((b) => b)).then((buf) => {
  fs.writeFileSync(path.join(OUT, "favicon/favicon.ico"), buf);
  console.log("done");
});
