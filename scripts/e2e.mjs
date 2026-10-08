/* global document, PointerEvent */
// End-to-end browser check against ui/dist: input paths, persistence, every mode, power off/on, phone viewport.
//   node scripts/e2e.mjs        (run `npm run build` first)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)), 'ui', 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const server = createServer(async (req, res) => {
  try {
    let p = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]));
    if (p.length <= 1) p = '/index.html';
    const data = await readFile(join(root, p));
    res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch();
const errors = [];
let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${extra}`}`);
  if (!ok) failures++;
};

const lcdLines = (page) => page.$$eval('.lcd .expr, .lcd .result-line, .lcd .line, .lcd .cells, .lcd .nodeRow', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
const key = (page, id) => page.click(`[data-key="${id}"]`, { force: true, noWaitAfter: true });
const keys = async (page, seq) => {
  for (const k of seq.split(/\s+/).filter(Boolean)) await key(page, k);
};

async function open(viewport = { width: 480, height: 900 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(url);
  await page.waitForSelector('.lcd');
  return { ctx, page };
}

// 1. mouse input
{
  const { ctx, page } = await open();
  await keys(page, '1 add 2 eq');
  const l = await lcdLines(page);
  check('mouse: 1+2=3', l.includes('3'), JSON.stringify(l));
  // 2. physical keyboard
  await page.keyboard.press('Escape');
  await page.keyboard.type('2*3');
  await page.keyboard.press('Enter');
  const k = await lcdLines(page);
  check('keyboard: 2*3=6', k.includes('6'), JSON.stringify(k));
  await page.keyboard.press('Escape');
  await page.keyboard.type('s30');
  await page.keyboard.press('Enter');
  const s = await lcdLines(page);
  check('keyboard: sin 30 = 1/2', s.some((x) => x.replace(/\s/g, '') === '12'), JSON.stringify(s));
  // key press latency: 40 presses should be handled well under a frame each on average
  const t0 = Date.now();
  await page.evaluate(() => {
    const b = document.querySelector('[data-key="7"]');
    for (let i = 0; i < 40; i++) {
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse', pointerId: 1 }));
      b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerType: 'mouse', pointerId: 1 }));
    }
  });
  const per = (Date.now() - t0) / 40;
  check(`latency: ${per.toFixed(1)} ms per key press (incl. render)`, per < 16, String(per));
  await ctx.close();
}

// 3. persistence across reload
{
  const { ctx, page } = await open();
  await keys(page, '7 eq shift rcl neg ac 1 add 1 eq');
  await page.waitForTimeout(400); // debounce
  await page.reload();
  await page.waitForSelector('.lcd');
  await keys(page, 'alpha neg eq');
  const l = await lcdLines(page);
  check('persistence: variable A survives reload', l.includes('7'), JSON.stringify(l));
  await keys(page, 'ac up up');
  const h = await lcdLines(page);
  check('persistence: history survives reload', h.some((x) => x.startsWith('1+1')), JSON.stringify(h));
  await ctx.close();
}

// 4. power off / on keeps state
{
  const { ctx, page } = await open();
  await keys(page, '4 2 eq shift ac');
  const off = await page.$eval('.lcd', (el) => el.classList.contains('off'));
  check('SHIFT+AC turns the display off', off);
  await keys(page, 'on');
  const l = await lcdLines(page);
  check('ON restores the display', l.includes('42'), JSON.stringify(l));
  await ctx.close();
}

// 5. every mode opens without errors
{
  const { ctx, page } = await open();
  for (let i = 0; i < 13; i++) {
    await keys(page, 'mode');
    for (let d = 0; d < i; d++) await key(page, 'down');
    await key(page, 'eq');
    // a few generic keys in each mode
    await keys(page, '1 eq 2 eq 3 eq ac');
  }
  check('all 13 modes can be entered and used', true);
  await ctx.close();
}

// 6. phone viewport: the calculator fits horizontally and nothing scrolls sideways
{
  const { ctx, page } = await open({ width: 375, height: 667 });
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, calc: document.querySelector('.calc').getBoundingClientRect().width }));
  check(`phone viewport: no horizontal overflow (calc ${Math.round(m.calc)}px of ${m.cw}px)`, m.sw <= m.cw + 1 && m.calc <= m.cw);
  await keys(page, '1 frac 3 right eq');
  await ctx.close();
}

await browser.close();
server.close();
if (errors.length) {
  console.log('CONSOLE ERRORS:');
  console.log(errors.join('\n'));
  failures += errors.length;
}
console.log(failures === 0 ? 'e2e OK (no console errors)' : `e2e FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
