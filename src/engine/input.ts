import type { PlayerState } from './core/player';

export class Input {
  private canvas: HTMLCanvasElement;
  private abort = new AbortController();
  private keys = new Set<string>();
  private touchX = 0;
  private touchZ = 0;
  private touch = false;
  private wantsControl = false;
  private lockRevision = 0;
  private disposed = false;
  private jumpQueued = false;
  private priorButtons: boolean[] = [];
  primary = false;
  secondary = false;
  lookX = 0;
  lookY = 0;
  sensitivity = 1;
  gamepadSensitivity = 1;
  onChange = () => {};
  onPause = () => {};
  onHotbar = (_direction: -1 | 1) => {};
  onCommand = (_code: string) => {};
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.bind(canvas);
  }
  /** A new canvas never inherits a pointer lock, touches or a pending jump. */
  rebind(canvas: HTMLCanvasElement) {
    if (this.disposed || this.canvas === canvas) return false;
    this.abort.abort();
    this.lockRevision++;
    this.wantsControl = this.touch = false;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.reset();
    this.canvas = canvas;
    this.abort = new AbortController();
    this.bind(canvas);
    this.onChange();
    return true;
  }
  private bind(canvas: HTMLCanvasElement) {
    const signal = this.abort.signal;
    document.addEventListener(
      'pointerlockchange',
      () => {
        if (document.pointerLockElement === this.canvas && !this.wantsControl) document.exitPointerLock();
        if (!this.active) this.reset();
        this.onChange();
      },
      { signal },
    );
    document.addEventListener(
      'keydown',
      (e) => {
        if (this.active) {
          this.keys.add(e.code);
          if (e.code === 'Space') e.preventDefault();
          if (e.code === 'Space' && !e.repeat) this.jumpQueued = true;
          if (!e.repeat) this.onCommand(e.code);
        }
      },
      { signal },
    );
    document.addEventListener('keyup', (e) => this.keys.delete(e.code), { signal });
    const mouseLook = (e: MouseEvent) => {
      if (!this.active || document.pointerLockElement !== canvas) return;
      if ('pointerType' in e && e.pointerType !== 'mouse') return;
      // A coalesced move summarizes its samples. Consume the samples OR the
      // summary, never both or the synthesized compatibility mouse event.
      const samples = (e as PointerEvent).getCoalescedEvents?.();
      for (const d of samples?.length ? samples : [e]) this.look(d.movementX, d.movementY);
    };
    document.addEventListener(typeof PointerEvent === 'function' ? 'pointermove' : 'mousemove', mouseLook, { signal });
    canvas.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.active || document.pointerLockElement !== canvas) return;
        if (e.button === 0) this.primary = true;
        if (e.button === 2) this.secondary = true;
        if (e.button === 1) {
          e.preventDefault();
          this.onCommand('Pick');
        }
      },
      { signal },
    );
    document.addEventListener(
      'pointerup',
      (e) => {
        if (e.button === 0) this.primary = false;
        if (e.button === 2) this.secondary = false;
      },
      { signal },
    );
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    window.addEventListener('blur', () => this.unlock(), { signal });
  }
  get active() {
    return !this.disposed && this.wantsControl && (this.touch || document.pointerLockElement === this.canvas);
  }
  async lock() {
    if (this.disposed) return;
    const revision = ++this.lockRevision;
    const canvas = this.canvas;
    this.wantsControl = true;
    try {
      try {
        await canvas.requestPointerLock({ unadjustedMovement: true });
      } catch (error) {
        if (!(error instanceof Error) || error.name !== 'NotSupportedError') throw error;
        if (revision !== this.lockRevision || this.disposed) return;
        await canvas.requestPointerLock();
      }
      if (revision !== this.lockRevision || this.disposed) {
        if ((canvas !== this.canvas || !this.wantsControl) && document.pointerLockElement === canvas) document.exitPointerLock();
        return;
      }
      this.onChange();
    } catch (error) {
      if (revision !== this.lockRevision || this.disposed) return;
      this.wantsControl = false; this.onChange();
      throw error;
    }
  }
  unlock() {
    this.lockRevision++;
    this.wantsControl = false;
    this.touch = false;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.reset();
    this.onChange();
  }
  touchLock() {
    if (this.disposed) return;
    this.lockRevision++;
    this.wantsControl = true;
    this.touch = true;
    this.onChange();
  }
  move(x: number, z: number) {
    this.touchX = x;
    this.touchZ = z;
  }
  look(dx: number, dy: number) {
    if (this.active) {
      this.lookX += dx;
      this.lookY += dy;
    }
  }
  jump() {
    this.jumpQueued = true;
  }
  sample(p: PlayerState, dt: number) {
    let x = this.touchX + (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    let z = this.touchZ + (this.keys.has('KeyS') ? 1 : 0) - (this.keys.has('KeyW') ? 1 : 0);
    const jump = this.jumpQueued;
    let jumpHeld = this.keys.has('Space');
    this.jumpQueued = false;
    const pad = navigator.getGamepads?.().find((p) => p?.connected);
    if (pad && this.active) {
      const axis = (v: number) => (Math.abs(v) > 0.18 ? v : 0);
      x += axis(pad.axes[0] ?? 0);
      z += axis(pad.axes[1] ?? 0);
      this.lookX += axis(pad.axes[2] ?? 0) * dt * 650 * this.gamepadSensitivity;
      this.lookY += axis(pad.axes[3] ?? 0) * dt * 650 * this.gamepadSensitivity;
      jumpHeld ||= pad.buttons[0]?.pressed;
      this.primary = pad.buttons[7]?.pressed ?? false;
      this.secondary = pad.buttons[6]?.pressed ?? false;
      if (pad.buttons[9]?.pressed && !this.priorButtons[9]) this.onPause();
      if (pad.buttons[4]?.pressed && !this.priorButtons[4]) this.onHotbar(-1);
      if (pad.buttons[5]?.pressed && !this.priorButtons[5]) this.onHotbar(1);
      this.priorButtons = pad.buttons.map((b) => b.pressed);
    }
    p.yaw -= this.lookX * 0.002 * this.sensitivity;
    p.pitch = Math.max(-1.55, Math.min(1.55, p.pitch - this.lookY * 0.002 * this.sensitivity));
    this.lookX = this.lookY = 0;
    return { x, z, jump, jumpHeld };
  }
  private reset() {
    this.keys.clear();
    this.priorButtons = [];
    this.primary = this.secondary = false;
    this.touchX = this.touchZ = this.lookX = this.lookY = 0;
    this.jumpQueued = false;
  }
  dispose() {
    this.disposed = true;
    this.unlock();
    this.abort.abort();
  }
}
