# agent.md — guide for maintaining this project

Audience: a developer or AI agent changing the fx-580VN X emulator later. Read this first, then `README.md`
(usage, keymap) and `docs/ASSUMPTIONS.md` (every guessed device behaviour).

## 1. What this is

Offline emulator of the Casio fx-580VN X. npm workspaces:

| Path | Role |
|---|---|
| `engine/` | pure TypeScript, **no UI/DOM dependency**, all calculator logic + Vitest tests |
| `ui/` | React + Vite front end (LCD renderer, keypad, keyboard map, persistence, click sound) |
| `electron/` | desktop wrapper (`main.cjs`, `icon.*`) |
| `docs/` | `ASSUMPTIONS.md`, screenshot |
| `scripts/` | dev helpers: `lcds.mjs`, `shot.mjs`, `e2e.mjs`, `electron-smoke.mjs` |
| `legacy/` | an old single-file prototype; ignored by lint/build, do not extend |

The UI never contains calculator logic: it sends **key ids** to `Calculator.press(id)` and renders `calculator.screen`.

## 2. Commands (repo root)

```
npm install
npm run dev            # vite dev server, http://localhost:5173
npm test               # engine tests (must stay green)
npm run lint           # eslint; must stay clean
npm run build          # tsc (engine + ui) + vite build -> ui/dist
npm run e2e            # browser e2e (needs build first), asserts no console errors
npm run smoke:electron # Electron against ui/dist
npm run package:dir    # unpacked desktop app -> release/win-unpacked
```

Definition of "done" for any change: `npm test`, `npm run lint`, `npm run build` all pass, and for UI changes also
`npm run e2e`. Installed copy and redeploy steps are in `README.md` ("Maintenance and deployment").

## 3. Engine architecture (`engine/src`)

Data flow: **keys → editor items → tokens → AST → value → render tree → screen rows**.

1. `keypad.ts` — key table (id, labels, `[plain, shift, alpha]` commands) and `resolveKey`.
2. `calculator.ts` — `Calculator`: SHIFT/ALPHA/hyp, STO/RCL, menus (MODE, SETUP, CLR, CONST, CONV, DRG, OPTN), mode
   switching, `screen` view model, `serialize()/restore()`. Modes register themselves with `registerMode`.
3. `modes/*.ts` — one controller per mode implementing `ModeController` (`handle(cmd)`, `screen()`,
   `serialize/restore`, optional `enter`). `modes/index.ts` imports them all (add new modes there).
4. `pad.ts` — `ExprPad`: expression editor + result + history + CALC/SOLVE sessions; reused by COMP, CMPLX, BASE,
   MATRIX, VECTOR, STAT, VERIFY. `grid.ts` (`CellGrid`) and `exprline.ts` are the reusable data-entry widgets.
5. `inputcmds.ts` — how a command inserts text/templates into the editor (`applyInsert`).
6. `editor/editor.ts` — structured editor (tree of `Item`s, cursor = path + index); `editor/render.ts` — items → `RNode`.
7. `items.ts` → `parser.ts` (lexer + recursive descent, stack-limit check) → `ast.ts` → `evaluator.ts`.
8. Numbers: `bigmath.ts`, `rational.ts` (`Q`), `exact.ts` (sum of `c·π^p·√r`, canonical), `num.ts` (`Num` = exact
   `x` with decimal flag `d`, or approximation `a` rounded to 15 digits; overflow ≥1e100 → Math ERROR),
   `mathfn.ts` (functions, exact special angles/logs), `complex.ts`, `matrix.ts`, `stat.ts`, `dist.ts`, `poly.ts`.
9. Output: `format/decimal.ts` (Norm/Fix/Sci/ENG), `format/exact.ts` (fractions/radicals/π), `format/value.ts`
   (Val → `RNode` lines), `format/rnode.ts` (tree + `plain()` used by tests).
10. `fast.ts` — double-precision closure compiler + Gauss–Kronrod ∫ and Ridders d/dx; `solver.ts` — SOLVE.

Key invariants:
* `Ex` (exact.ts) is canonical: square-free radicands, merged terms, sorted. Never build terms by hand without
  `normalize`/the ops, or equality (`exCmp`) breaks.
* The **decimal flag** `d` on exact `Num` decides which form is shown first and what S⇔D does. Keep it when combining
  numbers (`d = a.d || b.d`); irrational function results are `a` (no toggle).
* Everything that can fail on user input throws `CalcError` (`errors.ts`); anything else is a bug —
  `Calculator.press` catches it and shows "System ERROR" instead of crashing the UI.
* Editor `Item` JSON is persisted (history). Changing `Item` shapes needs a migration in `restore()` or a version bump.
* `ctx.vars` is shared mutable state (A–F, X, Y, M). Code that sets `X` temporarily (Σ, table, ∫ fallback) must restore it.

## 4. How to… (recipes)

**Add or change a function** (e.g. a new `foo(`): add the lexeme to `FN_LEXEMES` in `parser.ts`; implement it in
`mathfn.ts` (Num → Num, exact when possible); route it in `callFn` in `evaluator.ts` (and `fast.ts` if ∫/d/dx should
use the fast path); give it a key/menu entry (`keypad.ts`, `calculator.ts` OPTN, or the mode's menu); add golden tests.

**Add a key command**: put the command in `keypad.ts`; if it edits the expression add it to `inputcmds.ts`
(`SIMPLE` map or the `switch`); machine-level commands go in `Calculator.exec` or the mode controller's `handle`.

**Add a mode**: create `modes/foo.ts` implementing `ModeController`, call `registerMode('FOO', …)`, import it in
`modes/index.ts`, add it to `MODE_LIST` in `calculator.ts` and extend the `ModeId` union. Use `CellGrid`/`ExprPad`.
Write key-sequence tests (see below) and add the mode to the fuzz start modes (`tests/fuzz.test.ts` uses `seed % 13`).

**Change display rules** (digits, fraction limits, term order): `format/*.ts`; limits are constants at the top of
`format/exact.ts` (`MAX_DIGITS`, `MAX_TERMS`) and in `num.ts` (`MAX_TERMS`, `MAX_PI`). Update `docs/ASSUMPTIONS.md`.

**Fix a device-behaviour mismatch**: write the correct expectation (move/modify the case in
`tests/unverified.test.ts` or `comp.test.ts`), make it pass, update the matching row in `docs/ASSUMPTIONS.md`.

## 5. Tests

* `tests/comp.test.ts`, `comp2.test.ts` — golden COMP cases via the text DSL (`helpers.ts`: `c('sqrt(8)')` → `'2√2'`).
  DSL: `frac(a,b) mix(w,n,d) sqrt( cbrt( root(n,a) abs( logb(b)( pow(e) sum(lo,hi,body) int(lo,hi,body) deriv(body,at)`,
  `pi`, `E` exponent (`1.5E3`), `÷R`; `÷`/`×` or `/` `*`. Results are the `plain()` form: `√2/2`, `(√6-√2)/4`, `π^2`,
  `1.5×10^3`, `2 1/3`.
* `tests/keys.test.ts`, `eqn/ineq/stat/dist/table/matrix/modes2/basen/complex.test.ts` — drive the real
  `Calculator` with key ids (`tests/keyhelpers.ts`: `press(c, 'sqrt 8 eq')`, `lines(c)` = screen text). Menu digits,
  e.g. `shift 4 3` = MATRIX menu → MatA, are positional: keep tests in sync when a menu changes.
* `core.test.ts` — property tests (fast-check) incl. decimal engine vs `decimal.js` at 120 digits.
* `fuzz.test.ts` — random key presses in every mode must never set `calculator.fatal`.
* `perf.test.ts` — time guards (Σ 10 000 terms, ∫, etc.).
* `unverified.test.ts` — documents guessed behaviour; every entry has `// UNVERIFIED` and a row in `ASSUMPTIONS.md`.

## 6. UI notes (`ui/src`)

* `App.tsx` owns the `Calculator`, persistence (`storage.ts`, key `fx580vnx.state.v1`, saved ~250 ms after a key and on
  unload), prefs (theme, sound), physical keyboard (`keyboard.ts`) and the help overlay.
* `Lcd.tsx` renders `Screen` rows; `MathView.tsx` renders `RNode` with CSS (fractions, radicals via stretched SVG).
  All sizes are in `em`/`cqw` so the LCD scales with its container. Keep it that way.
* `Keypad.tsx` fires on `pointerdown` (latency) with auto-repeat for arrows/DEL. Buttons carry `data-key` used by scripts.
* Production CSP is injected by `ui/vite.config.ts` (no inline scripts, no network). Do not add remote fonts/scripts.
* Fonts: `@fontsource/vt323` is bundled; nothing is fetched at runtime.

## 7. Packaging

`electron/main.cjs` loads `ui/dist/index.html`; when packaged it stores user data in `<exe dir>\data`.
`package.json` → `build` configures electron-builder; Windows uses `signAndEditExecutable:false` (no symlink privilege
needed). Only `--dir` builds are verified; NSIS/portable need Windows Developer Mode.

## 8. Pitfalls seen during development

* Shell: complex heredocs mixing quotes can fail in the Bash tool — create files with an editor/Write tool and run
  small script files. PowerShell's COM `CreateShortcut` rejects non-ASCII target paths (the repo path contains `ị`);
  install the app to an ASCII path (currently `D:\C\program\fx580vnx`).
* npm may block package install scripts (Electron binary): `node node_modules/electron/install.js`.
* Don't rename key ids or command strings casually: tests, scripts and docs reference them (`'eq'`, `'shift'`,
  `'alpha'`, `'sd'`, `'integ'` …).
* `Decimal` instances come from the cloned `D` in `dec.ts` (60 digits). Never mix with the global `decimal.js` default
  precision; `dist.ts` uses its own 100-digit clone `W` intentionally.
* After changing exact/rounding code run the property tests and the full golden set: ordering of radical terms,
  the 10-digit display limit and the decimal flag are easy to disturb.

## 9. Known limitations (see README "Not yet implemented")

Spreadsheet has no copy/paste/fill; EQN has no Func analysis; SOLVE solves only X/first variable; STAT has no graphs;
keypad pixels/legends are approximations. Real-device behaviour is **unverified** wherever `ASSUMPTIONS.md` says so.
