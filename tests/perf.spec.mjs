import { test, expect } from '@playwright/test';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const shots = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');

test('animated sky: no errors, smooth frames under 4x CPU throttling', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  await page.goto('/');
  await page.waitForFunction(() => window.__sky?.ready);
  const frames = await page.evaluate(() => new Promise((resolve) => {
    const t = []; let last = performance.now();
    function f(now) { t.push(now - last); last = now; if (t.length < 125) requestAnimationFrame(f); else resolve(t.slice(5)); }
    requestAnimationFrame(f);
  }));
  frames.sort((a, b) => a - b);
  const median = frames[frames.length >> 1];
  const p90 = frames[Math.floor(frames.length * 0.9)];
  console.log(`frame interval @4x CPU: median ${median.toFixed(1)} ms, p90 ${p90.toFixed(1)} ms`);
  await page.waitForTimeout(6000);
  await page.screenshot({ path: join(shots, 'animated.png') });

  expect(errors).toEqual([]);
  expect(median).toBeLessThan(20);
});
