import type { RNode } from 'fx580-engine';
import { Fragment, type ReactNode } from 'react';

/** Render a render-tree node as DOM. All sizing is in em so the LCD scales with its container. */
export function MathView({ node }: { node: RNode }): ReactNode {
  switch (node.t) {
    case 't':
      return <span className="tx">{fix(node.s)}</span>;
    case 'row':
      return (
        <span className="row">
          {node.c.map((c, i) => (
            <Fragment key={i}>
              <MathView node={c} />
            </Fragment>
          ))}
        </span>
      );
    case 'frac':
      return (
        <span className="frac">
          <span className="num">
            <MathView node={node.n} />
          </span>
          <span className="den">
            <MathView node={node.d} />
          </span>
        </span>
      );
    case 'mixed':
      return (
        <span className="row">
          <MathView node={node.w} />
          <span className="frac">
            <span className="num">
              <MathView node={node.n} />
            </span>
            <span className="den">
              <MathView node={node.d} />
            </span>
          </span>
        </span>
      );
    case 'sqrt':
      return (
        <span className="rad">
          {node.idx && (
            <span className="rad-idx">
              <MathView node={node.idx} />
            </span>
          )}
          <svg className="rad-sign" viewBox="0 0 10 20" preserveAspectRatio="none" aria-hidden>
            <path d="M0.5 12 L2.5 10.5 L5.5 18.5 L9.8 0.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="miter" vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="rad-body">
            <MathView node={node.a} />
          </span>
        </span>
      );
    case 'sup':
      return (
        <span className="sup">
          <MathView node={node.e} />
        </span>
      );
    case 'sub':
      return (
        <span className="sub">
          <MathView node={node.e} />
        </span>
      );
    case 'box':
      return <span className="box" />;
    case 'cur':
      return <span className={node.ins === false ? 'cur ovr' : 'cur'} data-cursor="1" />;
    case 'abs':
      return (
        <span className="abs">
          <MathView node={node.a} />
        </span>
      );
    case 'big':
      return (
        <span className="big">
          <span className="big-sym">
            <span className="big-hi">{node.hi && <MathView node={node.hi} />}</span>
            <span className="big-glyph">{node.s}</span>
            <span className="big-lo">{node.lo && <MathView node={node.lo} />}</span>
          </span>
          {node.suffix ? (
            <>
              <MathView node={node.body} />
              <span className="tx">{node.suffix}</span>
            </>
          ) : (
            <>
              <span className="tx">(</span>
              <MathView node={node.body} />
              <span className="tx">)</span>
            </>
          )}
        </span>
      );
    case 'deriv':
      return (
        <span className="row">
          <span className="frac">
            <span className="num">
              <span className="tx">d</span>
            </span>
            <span className="den">
              <span className="tx">dx</span>
            </span>
          </span>
          <span className="tx">(</span>
          <MathView node={node.body} />
          <span className="tx">)</span>
          <span className="sub">
            <span className="tx">x=</span>
            <MathView node={node.at} />
          </span>
        </span>
      );
    case 'mat':
      return (
        <span className="mat">
          <span className="mat-body">
            {node.rows.map((r, i) => (
              <span className="mat-row" key={i}>
                {r.map((c, j) => (
                  <span className="mat-cell" key={j}>
                    <MathView node={c} />
                  </span>
                ))}
              </span>
            ))}
          </span>
        </span>
      );
  }
}

/** typographic fixes for the LCD font */
function fix(s: string): string {
  return s.replace(/-/g, '−');
}
