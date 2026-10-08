/* global localStorage */
// Dev tool: capture the LCD after several key sequences (separated by "|") and save one PNG per sequence.
//   node scripts/lcds.mjs <outPrefix> "<keys1>|<keys2>|..." [theme]
// Each sequence starts from a fresh calculator. Prints the LCD text of every state and console errors.
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
const port = server.address().port;

const [prefix, seqs = '', theme = 'dark'] = process.argv.slice(2);
const browser = await chromium.launch();
const errors = [];
let n = 0;
for (const seq of seqs.split('|')) {
  const page = await browser.newPage({ viewport: { width: 520, height: 960 }, deviceScaleFactor: 2 });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.addInitScript((t) => {
    localStorage.clear();
    localStorage.setItem('fx580vnx.prefs.v1', JSON.stringify({ theme: t, sound: false }));
  }, theme);
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector('.lcd', { timeout: 5000 });
  for (const k of seq.split(/\s+/).filter(Boolean)) await page.click(`[data-key="${k}"]`, { noWaitAfter: true, force: true });
  await page.waitForTimeout(120);
  await page.locator('.lcd-frame').screenshot({ path: `${prefix}${n}.png` });
  console.log(`#${n} [${seq}]`, JSON.stringify(await page.$eval('.lcd', (el) => el.innerText.replace(/\n/g, ' '))));
  n++;
  await page.close();
}
await browser.close();
server.close();
if (errors.length) {
  console.log('ERRORS:');
  console.log(errors.join('\n'));
  process.exit(1);
}
