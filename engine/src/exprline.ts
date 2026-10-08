// A single-line expression input (used for f(X), g(X) and similar prompts).

import { deleteBack, moveDown, moveLeft, moveRight, moveUp, newEditor, setRoot, type Editor } from './editor/editor';
import { renderEditor } from './editor/render';
import type { RNode } from './format/rnode';
import { applyInsert, isInsertCmd } from './inputcmds';
import type { Slot } from './items';
import type { GridHost } from './grid';

export class ExprLine {
  ed: Editor = newEditor();
  constructor(private readonly host: GridHost) {}

  get items(): Slot {
    return this.ed.root;
  }
  set(items: Slot): void {
    setRoot(this.ed, JSON.parse(JSON.stringify(items)) as Slot);
  }
  clear(): void {
    this.ed = newEditor();
  }
  node(): RNode {
    return renderEditor(this.ed);
  }

  /** returns 'enter' on =, 'cancel' on AC, otherwise whether the command was consumed */
  handle(cmd: string): 'enter' | 'cancel' | boolean {
    switch (cmd) {
      case 'eq':
        return 'enter';
      case 'ac':
        return 'cancel';
      case 'left':
        moveLeft(this.ed);
        return true;
      case 'right':
        moveRight(this.ed);
        return true;
      case 'up':
        moveUp(this.ed);
        return true;
      case 'down':
        moveDown(this.ed);
        return true;
      case 'del':
        deleteBack(this.ed);
        return true;
      case 'ins':
        this.ed.insert = !this.ed.insert;
        return true;
      default:
        break;
    }
    if (isInsertCmd(cmd)) {
      applyInsert(this.ed, cmd, this.host.takeHyp(), this.host.setup.io === 'line');
      return true;
    }
    return false;
  }
}
