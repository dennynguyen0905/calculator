import { Calculator } from 'fx580-engine';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Keypad } from './Keypad';
import { Lcd } from './Lcd';
import { keySeqFor, KEYBOARD_HELP } from './keyboard';
import { click } from './sound';
import { clearState, loadPrefs, loadState, savePrefs, saveState, type Prefs } from './storage';

export function App() {
  const calc = useMemo(() => {
    const c = new Calculator();
    const saved = loadState();
    if (saved) c.restore(saved);
    return c;
  }, []);
  const [, force] = useReducer((n: number) => n + 1, 0);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [flash, setFlash] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const flashTimer = useRef<number | null>(null);
  const soundOn = useRef(prefs.sound);
  soundOn.current = prefs.sound;

  const press = useCallback(
    (id: string) => {
      if (soundOn.current) click(id === 'shift' || id === 'alpha' ? 'mod' : 'key');
      calc.press(id);
      force();
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => saveState(calc.serialize()), 250);
    },
    [calc],
  );

  // physical keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const seq = keySeqFor(e);
      if (!seq) return;
      e.preventDefault();
      for (const k of seq) press(k);
      const last = seq[seq.length - 1];
      setFlash(last);
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(null), 110);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  // persist on tab hide / unload
  useEffect(() => {
    const persist = () => saveState(calc.serialize());
    window.addEventListener('beforeunload', persist);
    document.addEventListener('visibilitychange', persist);
    return () => {
      window.removeEventListener('beforeunload', persist);
      document.removeEventListener('visibilitychange', persist);
    };
  }, [calc]);

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
    savePrefs(prefs);
  }, [prefs]);

  const screen = calc.screen;

  return (
    <div className="stage">
      <div className="toolbar">
        <button type="button" onClick={() => setPrefs((p) => ({ ...p, theme: p.theme === 'dark' ? 'light' : 'dark' }))}>
          {prefs.theme === 'dark' ? '☀ Light' : '☾ Dark'}
        </button>
        <button type="button" onClick={() => setPrefs((p) => ({ ...p, sound: !p.sound }))} aria-pressed={prefs.sound}>
          {prefs.sound ? '🔊 Click on' : '🔈 Click off'}
        </button>
        <button type="button" onClick={() => setHelp((h) => !h)}>
          ⌨ Keys
        </button>
        <button
          type="button"
          onClick={() => {
            clearState();
            window.location.reload();
          }}
          title="Forget saved variables, history and settings"
        >
          ⟲ Reset
        </button>
      </div>
      <div className="calc">
        <div className="brand">
          <span className="casio">CASIO</span>
          <span className="model">fx-580VN X</span>
          <span className="sub">NATURAL-V.P.A.M.</span>
        </div>
        <div className="lcd-frame">
          <div className="lcd-wrap">
            <Lcd screen={screen} />
          </div>
        </div>
        <Keypad onPress={press} flash={flash} />
      </div>
      {help && (
        <div className="help" onClick={() => setHelp(false)}>
          <table>
            <tbody>
              {KEYBOARD_HELP.map(([k, v]) => (
                <tr key={k}>
                  <th>{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
