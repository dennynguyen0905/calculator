// Abstract syntax tree produced by the parser.

export type Ast =
  | { k: 'num'; text: string; exp?: Ast; radix: number; pos: number }
  | { k: 'id'; name: string; pos: number }
  | { k: 'neg'; a: Ast }
  | { k: 'paren'; a: Ast }
  | { k: 'bin'; op: string; a: Ast; b: Ast }
  | { k: 'post'; op: string; a: Ast }
  | { k: 'call'; name: string; args: Ast[] }
  | { k: 'dms'; deg?: Ast; min?: Ast; sec?: Ast }
  | { k: 'sigma'; lo: Ast; hi: Ast; body: Ast }
  | { k: 'integ'; lo: Ast; hi: Ast; body: Ast }
  | { k: 'deriv'; body: Ast; at: Ast }
  | { k: 'convert'; code: number; a: Ast };

export type BinOp =
  | '+'
  | '-'
  | '×'
  | '÷'
  | 'imul'
  | '^'
  | 'nPr'
  | 'nCr'
  | '∠'
  | '·'
  | '÷R'
  | 'and'
  | 'or'
  | 'xor'
  | 'xnor';
