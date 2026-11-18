export type Panel = 'menu' | 'inventory' | 'settings' | 'model' | 'file';
export type ControlState =
  | { mode: 'panel'; panel: Panel }
  | { mode: 'ready' | 'requesting' | 'playing' | 'dead' };

/** Synchronous state transitions; async lock/file callbacks carry a revision. */
export class ControlStateMachine {
  state: ControlState = { mode: 'panel', panel: 'menu' };
  revision = 0;
  open(panel: Panel) { this.revision++; this.state = { mode: 'panel', panel }; }
  ready() { this.revision++; this.state = { mode: 'ready' }; }
  request() { this.revision++; this.state = { mode: 'requesting' }; return this.revision; }
  failed(revision: number) {
    if (revision === this.revision && this.state.mode === 'requesting') this.ready();
  }
  observe(locked: boolean, dead: boolean): boolean {
    if (dead) { if (this.state.mode !== 'dead') this.revision++; this.state = { mode: 'dead' }; return locked; }
    if (locked) {
      if (this.state.mode === 'requesting' || this.state.mode === 'playing') this.state = { mode: 'playing' };
      else return true; // A late acquisition must not dismiss an explicitly opened panel.
    } else if (this.state.mode === 'playing' || this.state.mode === 'dead') this.open('menu');
    return false;
  }
  get panel(): Panel | null { return this.state.mode === 'panel' ? this.state.panel : null; }
  get prompt() { return this.state.mode === 'ready' || this.state.mode === 'requesting'; }
}
