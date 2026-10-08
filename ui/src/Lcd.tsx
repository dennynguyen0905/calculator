import type { Row, Screen, Status } from 'fx580-engine';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { MathView } from './MathView';

function Ind({ on, children, cls }: { on: boolean; children: ReactNode; cls?: string }) {
  return <span className={`ind ${on ? 'on' : ''} ${cls ?? ''}`}>{children}</span>;
}

function StatusBar({ s }: { s: Status }) {
  return (
    <div className="status">
      <div className="st-left">
        <Ind on={s.shift}>S</Ind>
        <Ind on={s.alpha}>A</Ind>
        <Ind on={s.hyp}>hyp</Ind>
        <Ind on={s.m}>M</Ind>
        <Ind on={s.sto}>STO</Ind>
        <Ind on={s.rcl}>RCL</Ind>
        <Ind on>{s.mode}</Ind>
      </div>
      <div className="st-right">
        <Ind on={s.math}>Math</Ind>
        <Ind on={s.angle === 'D'}>D</Ind>
        <Ind on={s.angle === 'R'}>R</Ind>
        <Ind on={s.angle === 'G'}>G</Ind>
        <Ind on={s.fix}>FIX</Ind>
        <Ind on={s.sci}>SCI</Ind>
        <Ind on={s.overwrite}>↺</Ind>
        <Ind on={s.disp}>Disp</Ind>
        <Ind on={s.up}>▲</Ind>
        <Ind on={s.down}>▼</Ind>
      </div>
    </div>
  );
}

/** expression row: scrolls horizontally to keep the cursor visible */
function ExprRow({ node }: { node: Row & { t: 'expr' } }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  const [clip, setClip] = useState<{ l: boolean; r: boolean }>({ l: false, r: false });
  useLayoutEffect(() => {
    const b = box.current;
    const i = inner.current;
    if (!b || !i) return;
    const bw = b.clientWidth;
    const iw = i.scrollWidth;
    let off = 0;
    if (iw > bw) {
      const cur = i.querySelector<HTMLElement>('[data-cursor]');
      const cx = cur ? cur.offsetLeft + cur.offsetWidth : iw;
      // keep the cursor inside the viewport with a margin
      const margin = bw * 0.12;
      if (cx > bw - margin) off = Math.min(iw - bw, cx - (bw - margin));
      if (!cur) off = iw - bw;
    }
    const l = off > 0;
    const r = iw - off > bw + 1;
    setShift((p) => (Math.abs(p - off) < 0.5 ? p : off));
    setClip((p) => (p.l === l && p.r === r ? p : { l, r }));
  });
  return (
    <div className="expr" ref={box}>
      <div className="expr-inner" ref={inner} style={{ transform: `translateX(${-shift}px)` }}>
        <MathView node={node.node} />
      </div>
      {clip.l && <span className="clip l">◀</span>}
      {clip.r && <span className="clip r">▶</span>}
    </div>
  );
}

function RowView({ row }: { row: Row }) {
  switch (row.t) {
    case 'expr':
      return <ExprRow node={row} />;
    case 'result':
      return (
        <div className={`result ${row.dim ? 'dim' : ''}`}>
          {row.nodes.map((n, i) => (
            <div className="result-line" key={i}>
              <MathView node={n} />
            </div>
          ))}
        </div>
      );
    case 'line':
      return <div className={`line ${row.inv ? 'inv' : ''} ${row.dim ? 'dim' : ''} ${row.title ? 'title' : ''} ${row.align ?? 'left'}`}>{row.text || ' '}</div>;
    case 'node':
      return (
        <div className={`nodeRow ${row.inv ? 'inv' : ''} ${row.align ?? 'left'}`}>
          <MathView node={row.node} />
        </div>
      );
    case 'cells':
      return (
        <div className="cells">
          {row.cells.map((c, i) => (
            <span key={i} className={`cell ${c.inv ? 'inv' : ''} ${c.cursor ? 'cellcur' : ''}`} style={c.w ? { flex: `0 0 ${c.w}%` } : undefined}>
              {c.node ? <MathView node={c.node} /> : c.text || ' '}
            </span>
          ))}
        </div>
      );
  }
}

export function Lcd({ screen }: { screen: Screen }) {
  return (
    <div className={`lcd ${screen.on ? '' : 'off'}`} role="img" aria-label="calculator display">
      {screen.on && (
        <>
          <StatusBar s={screen.status} />
          <div className={`content rows-${screen.rows.length}`}>
            {screen.rows.map((r, i) => (
              <RowView row={r} key={i} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
