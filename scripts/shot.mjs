/* global localStorage, sessionStorage */
// Dev tool: serve ui/dist, drive the calculator with key ids and save screenshots.
//   node scripts/shot.mjs <out.png|-> "<key ids...>" [width] [height] [theme]
// Prints the LCD text and any console errors / page errors (exit code 1 if any).
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)), 'ui', 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml' };

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

const [out, keys = '', w = '480', h = '900', theme = 'dark'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 2 });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.addInitScript((t) => {
  if (!sessionStorage.getItem('shot-init')) {
    localStorage.clear();
    sessionStorage.setItem('shot-init', '1');
  }
  localStorage.setItem('fx580vnx.prefs.v1', JSON.stringify({ theme: t, sound: false }));
}, theme);
await page.goto(`http://localhost:${port}/`);
try {
  await page.waitForSelector('.lcd', { timeout: 5000 });
} catch {
  console.log('LCD not found; errors so far:');
  console.log(errors.join('\n'));
  await browser.close();
  server.close();
  process.exit(1);
}
for (const k of keys.split(/\s+/).filter(Boolean)) {
  await page.click(`[data-key="${k}"]`, { noWaitAfter: true, force: true });
}
await page.waitForTimeout(150);
if (out && out !== '-') await page.screenshot({ path: out });
const text = await page.$eval('.lcd', (el) => el.innerText);
console.log('LCD>', JSON.stringify(text));
await browser.close();
server.close();
if (errors.length) {
  console.log('ERRORS:');
  console.log(errors.join('\n'));
  process.exit(1);
}
