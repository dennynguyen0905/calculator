/* global localStorage */
// Smoke test: launch the Electron app against ui/dist, press a few keys, check the LCD and console errors.
//   node scripts/electron-smoke.mjs [screenshot.png]
import { _electron as electron } from 'playwright';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const app = await electron.launch({ args: [join(root, 'electron', 'main.cjs')], cwd: root });
const win = await app.firstWindow();
const errors = [];
win.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
});
win.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await win.reload(); // re-run with listeners attached
await win.waitForSelector('.lcd', { timeout: 10000 });
await win.evaluate(() => localStorage.clear());
for (const k of ['1', 'frac', '3', 'right', 'add', 'sqrt', '2', 'right', 'eq']) await win.click(`[data-key="${k}"]`, { force: true });
await win.waitForTimeout(200);
const text = await win.$eval('.lcd', (el) => el.innerText.replace(/\n/g, ' '));
console.log('title:', await win.title());
console.log('LCD>', text);
if (process.argv[2]) await win.screenshot({ path: process.argv[2] });
await app.close();
if (errors.length) {
  console.log('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
if (!text.includes('1 3 + 2 1 + 3 2 3')) {
  console.log('unexpected LCD content');
  process.exit(1);
}
console.log('electron smoke OK');
