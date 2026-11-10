import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { FAKE_MIC_SCRIPT, DENIED_MIC_SCRIPT } from './fake-mic';

const ORIGIN = 'http://localhost:4173';

type Voice = { on(): void; off(): void; speechMode(v: boolean): void };
const voice = (page: Page, call: 'on' | 'off' | 'speechMode', arg?: boolean) =>
  page.evaluate(([c, a]) => {
    const v = (window as unknown as { __voice: Voice }).__voice;
    if (c === 'speechMode') v.speechMode(a as boolean);
    else if (c === 'on') v.on();
    else v.off();
  }, [call, arg] as const);

/** Records every request, websocket and the main-frame navigations of a page. */
function trackNetwork(page: Page) {
  const requests: { url: string; method: string }[] = [];
  const sockets: string[] = [];
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method() }));
  page.on('websocket', (ws) => sockets.push(ws.url()));
  return {
    violations(): string[] {
      const bad: string[] = [];
      for (const r of requests) {
        if (r.method !== 'GET') bad.push(`${r.method} ${r.url}`);
        if (!r.url.startsWith(ORIGIN + '/')) bad.push(`foreign ${r.method} ${r.url}`);
      }
      for (const s of sockets) bad.push(`websocket ${s}`);
      return bad;
    },
    count: () => requests.length,
  };
}

/** Runs one vowel + sentence set from the recording screen to the end of the sentence. */
async function recordSet(page: Page) {
  await expect(page.getByText('どうぞ')).toBeVisible({ timeout: 20_000 });
  await voice(page, 'on');
  await expect(page.getByText(/あと \d 秒/)).toBeVisible();
  // Like a person who holds 「あー」 slightly past the end of the vowel step: keep voicing until 300 ms
  // after the rest prompt appears, then stop.
  await expect(page.getByText('ひと息ついてください')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(300);
  await voice(page, 'off');
  await expect(page.getByText('ふだんの話し方で読み上げてください')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('どうぞ')).toBeVisible({ timeout: 20_000 });
  await voice(page, 'speechMode', true);
  await page.waitForTimeout(8_000);
  // The analysing message may be up only briefly: record whether it was ever shown.
  await page.evaluate(() => {
    const w = window as unknown as { __sawAnalyzing: boolean };
    w.__sawAnalyzing = false;
    new MutationObserver((_m, obs) => {
      if (document.body.textContent?.includes('結果をまとめています')) { w.__sawAnalyzing = true; obs.disconnect(); }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  await page.getByRole('button', { name: '終了' }).click();
  await voice(page, 'speechMode', false);
}

const mic = (page: Page) => page.evaluate(() => (window as unknown as { __mic: { opens: number; stops: number } }).__mic);
const sawAnalyzing = (page: Page) => page.evaluate(() => (window as unknown as { __sawAnalyzing: boolean }).__sawAnalyzing);

async function firstSet(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '声を録音する' }).click();
  await recordSet(page);
  await expect(page.locator('h2.headline')).toBeVisible({ timeout: 30_000 });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(FAKE_MIC_SCRIPT);
});

const noHScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('full flow, no network traffic beyond GET of own origin, 360px layout', async ({ page }, testInfo) => {
  const net = trackNetwork(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '声を録音する' })).toBeVisible();
  expect(await noHScroll(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('start.png'), fullPage: true });

  await page.getByRole('button', { name: '声を録音する' }).click();
  await recordSet(page);

  await expect(page.locator('h2.headline')).toContainText('参考', { timeout: 30_000 });
  expect(await sawAnalyzing(page)).toBe(true);
  expect(await mic(page)).toEqual({ opens: 1, stops: 1 }); // the mic is closed on the result screen
  await expect(page.locator('.graph-card svg.chart-bar rect.bar')).toHaveCount(6);
  await expect(page.locator('.graph-card svg.chart-pie path')).toHaveCount(6);
  await expect(page.locator('.graph-card svg.chart-polar g.ring')).toHaveCount(2);
  await expect(page.locator('.graph-card svg.chart-polar text.share-number')).toHaveCount(6);
  await expect(page.getByText(/^強い順:/)).toBeVisible();
  // The six numbers sit inside the circle card (not clipped by the viewBox).
  const clipped = await page.evaluate(() => {
    const svg = document.querySelector('svg.chart-polar')!;
    const box = svg.getBoundingClientRect();
    return [...svg.querySelectorAll('text.share-number')].some((t) => {
      const r = t.getBoundingClientRect();
      return r.left < box.left || r.right > box.right || r.top < box.top || r.bottom > box.bottom;
    });
  });
  expect(clipped).toBe(false);
  await expect(page.getByText('医療機関(耳鼻咽喉科)に相談してください')).toBeVisible();
  await expect(page.getByText('測った値')).toBeVisible();
  await expect(page.getByText(/声の高さ:約 \d+ Hz/)).toBeVisible();
  await expect(page.getByText('週3〜5日、2〜4週ほど続けてから')).toBeVisible();
  expect(await noHScroll(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('result.png'), fullPage: true });

  // 12 colours, then back; the inner ring checkbox hides only the inner ring.
  await page.getByRole('button', { name: '12色' }).click();
  await expect(page.getByRole('button', { name: '12色' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.graph-card svg.chart-bar rect.bar')).toHaveCount(12);
  await expect(page.locator('.graph-card svg.chart-pie path')).toHaveCount(12);
  await expect(page.locator('.graph-card svg.chart-polar text.share-number')).toHaveCount(12);
  expect(await noHScroll(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('result-12.png'), fullPage: true });
  await page.getByLabel('内側:「あー」').uncheck();
  await expect(page.locator('svg.chart-polar g.ring-inner')).toHaveCount(0);
  await expect(page.locator('svg.chart-polar g.ring-outer')).toHaveCount(1);
  await page.getByRole('button', { name: '6色' }).click();
  await expect(page.locator('.graph-card svg.chart-bar rect.bar')).toHaveCount(6);
  await expect(page.locator('svg.chart-polar g.ring-inner')).toHaveCount(0);

  expect(net.count()).toBeGreaterThan(0);
  expect(net.violations()).toEqual([]);
});

test('three sets drop the 参考 label and the extra-set button', async ({ page }) => {
  await firstSet(page);
  for (let i = 0; i < 2; i++) {
    if (i === 0) await expect(page.locator('h2.headline')).toContainText('参考');
    expect(await mic(page)).toEqual({ opens: i + 1, stops: i + 1 });
    await page.getByRole('button', { name: 'もう1セット録音する' }).click();
    await recordSet(page);
    await expect(page.locator('h2.headline')).toBeVisible({ timeout: 30_000 });
  }
  expect(await mic(page)).toEqual({ opens: 3, stops: 3 });
  await expect(page.getByText('より安定した結果')).toBeVisible();
  await expect(page.locator('h2.headline')).not.toContainText('参考');
  await expect(page.getByRole('button', { name: 'もう1セット録音する' })).toHaveCount(0);
  await page.getByRole('button', { name: '最初にもどる' }).click();
  await expect(page.getByRole('button', { name: '声を録音する' })).toBeVisible();
});

test('mic denied shows the denied screen and goes back to start', async ({ page }) => {
  await page.addInitScript(DENIED_MIC_SCRIPT);
  await page.goto('/');
  await page.getByRole('button', { name: '声を録音する' }).click();
  await expect(page.getByText('このページからマイクを使うことが許可されていません。')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '説明にもどる' }).click();
  await expect(page.getByRole('button', { name: '声を録音する' })).toBeVisible();
});

test('self-test: the network tracker flags a POST and a foreign origin', async ({ page }) => {
  const net = trackNetwork(page);
  await page.route(`${ORIGIN}/selftest`, (route) => route.fulfill({ status: 200, body: 'ok' }));
  await page.route('https://example.com/**', (route) => route.fulfill({ status: 200, body: 'ok' }));
  await page.goto('/');
  expect(net.violations()).toEqual([]);
  await page.evaluate(() => fetch('/selftest', { method: 'POST', body: 'x' }));
  expect(net.violations().some((v) => v.startsWith('POST'))).toBe(true);
  await page.evaluate(() => fetch('https://example.com/x', { mode: 'no-cors' }).catch(() => {}));
  expect(net.violations().some((v) => v.startsWith('foreign'))).toBe(true);
});

test('works from a sub-path (static hosting such as GitHub Pages /<repo>/)', async ({ page }) => {
  // Serves the dist/ built by the webServer under /repo/ only, like a project page.
  const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    if (!path.startsWith('/repo/')) { res.writeHead(404).end(); return; }
    const file = normalize(join('dist', path.slice('/repo/'.length) || 'index.html'));
    if (!file.startsWith('dist')) { res.writeHead(403).end(); return; }
    readFile(file).then(
      (body) => res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body),
      () => res.writeHead(404).end(),
    );
  });
  await new Promise<void>((resolve) => server.listen(4175, resolve));
  try {
    const failed: string[] = [];
    page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
    await page.goto('http://localhost:4175/repo/');
    await expect(page.getByRole('button', { name: '声を録音する' })).toBeVisible(); // blank page without base: './'
    await page.getByRole('button', { name: '声を録音する' }).click();
    await recordSet(page); // needs the AudioWorklet module to load from ./assets/
    await expect(page.locator('h2.headline')).toContainText('参考', { timeout: 30_000 });
    expect(failed).toEqual([]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
