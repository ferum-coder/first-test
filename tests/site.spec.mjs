import { test, expect } from '@playwright/test';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = join(root, 'tests', 'screenshots');

const VIEWPORTS = [
  { name: 'laptop', width: 1366, height: 768, browser: 'chromium' },
  { name: 'desktop', width: 1920, height: 1080, browser: 'chromium' },
  { name: 'wide', width: 2560, height: 1440, browser: 'chromium' },
  { name: 'iphone-se', width: 375, height: 667, dpr: 2, browser: 'webkit', mobile: true },
  { name: 'android', width: 360, height: 800, dpr: 3, browser: 'chromium', mobile: true },
  { name: 'tiny', width: 320, height: 568, browser: 'chromium', mobile: true },
  { name: 'phone-landscape', width: 800, height: 360, browser: 'chromium', mobile: true },
];

const TEXTS = {
  '.hero__title': 'Допомагаємо безкоштовно технічними матеріалами і обладнанням гурткам з електроніки і робототехніки та блогерам в Україні.',
  '.hero__cta-lead': 'Якщо ви викладач або блогер — перейдіть за посиланням і залиште ваші дані, ми обов’язково з вами зв’яжемося.',
  '#cta': 'Зв’язатися з нами',
  '.hero__privacy': 'Натискаючи кнопку, ви погоджуєтеся на обробку ваших персональних даних (ім’я, телефон, місто) лише для зв’язку з вами щодо проєкту Iskra. Ми не передаємо їх третім особам і видалимо на ваш запит.',
  '.footer': '© 2026 Iskra · iskra-project.com.ua',
};

const norm = (s) => s.replace(/\s+/g, ' ').trim();

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test('loads, texts, button, layout, sky', async ({ playwright }) => {
      const browser = await playwright[vp.browser].launch();
      const context = await browser.newContext({
        baseURL: 'http://localhost:8080',
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.dpr ?? 1,
        ...(vp.browser === 'chromium' ? { isMobile: !!vp.mobile } : {}),
        hasTouch: !!vp.mobile,
      });
      const page = await context.newPage();
      try {
      const errors = [];
      const external = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('request', (r) => { if (!r.url().startsWith('http://localhost:8080')) external.push(r.url()); });

      const res = await page.goto('/?still=1');
      expect(res.status()).toBe(200);
      await page.waitForFunction(() => window.__sky?.ready, null, { timeout: 10_000 });
      await page.evaluate(() => document.fonts.ready);

      // 1. no errors, no external requests
      expect(errors).toEqual([]);
      expect(external).toEqual([]);

      // 2. exact texts
      for (const [sel, text] of Object.entries(TEXTS)) {
        expect(norm(await page.locator(sel).textContent())).toBe(text);
      }

      // 3. button attributes and size
      const cta = page.locator('#cta');
      expect(await cta.getAttribute('href')).toBeTruthy();
      expect(await cta.getAttribute('target')).toBe('_blank');
      expect(await cta.getAttribute('rel')).toContain('noopener');
      const box = await cta.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(48);
      expect(box.height).toBeGreaterThanOrEqual(48);

      // 4. button in the first screen; desktop has no vertical scroll
      if (vp.name !== 'phone-landscape') {
        expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
      }
      if (['laptop', 'desktop', 'wide'].includes(vp.name)) {
        const sh = await page.evaluate(() => document.documentElement.scrollHeight);
        expect(sh).toBeLessThanOrEqual(vp.height);
      }

      // 5. no horizontal scroll
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(sw).toBeLessThanOrEqual(vp.width);

      // 6. constellations visible
      const visible = await page.evaluate(() => window.__sky.visible);
      const count = Object.values(visible).filter(Boolean).length;
      if (['laptop', 'desktop'].includes(vp.name)) expect(visible).toEqual(Object.fromEntries(Object.keys(visible).map((k) => [k, true])));
      if (vp.name === 'android') expect(count).toBeGreaterThanOrEqual(3);

      await page.waitForTimeout(1000); // canvas fade-in
      await page.screenshot({ path: join(shots, `${vp.name}.png`) });
      } finally {
        await browser.close();
      }
    });
  });
}

test.describe('behaviour', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('7. reduced motion: sky is static', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    await page.goto('http://localhost:8080/');
    await page.waitForFunction(() => window.__sky?.ready);
    await page.waitForTimeout(1000);
    const a = await page.locator('#sky').screenshot();
    await page.waitForTimeout(2000);
    const b = await page.locator('#sky').screenshot();
    expect(a.equals(b)).toBe(true);
    await ctx.close();
  });

  test('8. works without JavaScript', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    await page.goto('http://localhost:8080/');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('#cta')).toBeVisible();
    expect(await page.locator('#cta').getAttribute('href')).toBeTruthy();
    await page.screenshot({ path: join(shots, 'no-js.png') });
    await ctx.close();
  });

  test('9. first Tab focuses the button', async ({ page }) => {
    await page.goto('/?still=1');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('cta');
    await page.screenshot({ path: join(shots, 'focus.png') });
  });

  test('FR-5: click is tracked', async ({ page }) => {
    await page.addInitScript(() => { window.__events = []; window.plausible = (e) => window.__events.push(e); });
    await page.goto('/?still=1');
    await page.waitForFunction(() => window.__sky?.ready);
    await page.evaluate(() => {
      const a = document.getElementById('cta');
      a.addEventListener('click', (e) => e.preventDefault()); // keep the test page
      a.click();
    });
    expect(await page.evaluate(() => window.__events)).toContain('cta_click');
  });

  test('10. size budgets', async () => {
    const site = join(root, 'site');
    const walk = (d) => readdirSync(d).flatMap((f) => {
      const p = join(d, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
    const size = (f) => statSync(join(site, f)).size;
    const code = size('index.html') + size('styles.css') + size('sky.js');
    expect(code).toBeLessThanOrEqual(60 * 1024);
    expect(size('data/sky.json')).toBeLessThanOrEqual(160 * 1024);
    expect(size('fonts/manrope-cyrillic.woff2') + size('fonts/manrope-latin.woff2')).toBeLessThanOrEqual(120 * 1024);
    const firstLoad = code + size('data/sky.json') + size('fonts/manrope-cyrillic.woff2') +
      size('fonts/manrope-latin.woff2') + size('logo/svg/iskra-logo-short-white.svg');
    expect(firstLoad).toBeLessThanOrEqual(500 * 1024);
    expect(walk(site).length).toBeGreaterThan(0);
  });
});
