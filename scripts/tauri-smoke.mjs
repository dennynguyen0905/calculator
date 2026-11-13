// Smoke test: launch the built Tauri app and check it starts and stays alive (no immediate crash).
//   node scripts/tauri-smoke.mjs   (run `npm run package:dir` first)
//
// Unlike the old Electron smoke test, this cannot inspect the LCD or catch console errors: Playwright
// has no driver for the native WebView2 window Tauri uses. That would need `tauri-driver` (WebDriver);
// not set up here. This only proves packaging didn't break the binary.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const exe = join(root, 'src-tauri', 'target', 'release', 'app.exe');
if (!existsSync(exe)) {
  console.error(`missing ${exe} - run "npm run package:dir" first`);
  process.exit(1);
}

const proc = spawn(exe, [], { cwd: root });
let exited = false;
let exitCode = null;
proc.on('exit', (code) => {
  exited = true;
  exitCode = code;
});

await new Promise((r) => setTimeout(r, 3000));

if (exited) {
  console.error(`app exited early with code ${exitCode}`);
  process.exit(1);
}
proc.kill();
console.log('tauri smoke OK (app started and stayed alive for 3s)');
