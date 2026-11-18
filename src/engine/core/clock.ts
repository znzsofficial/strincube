export type Movement = { x: number; z: number; jump: boolean; jumpHeld?: boolean };

/** Carries edge-triggered input across render frames that have no simulation step. */
export class FixedClock {
  static readonly step = 1 / 60;
  private accumulator = 0;
  private jumpPending = false;

  advance(delta: number, movement: Movement, tick: (dt: number, jump: boolean) => boolean | void) {
    this.jumpPending ||= movement.jump;
    this.accumulator += Math.min(0.1, Math.max(0, Number.isFinite(delta) ? delta : 0));
    while (this.accumulator + 1e-10 >= FixedClock.step) {
      this.accumulator = Math.max(0, this.accumulator - FixedClock.step);
      const jump = this.jumpPending || !!movement.jumpHeld;
      this.jumpPending = false;
      if (tick(FixedClock.step, jump) === false) {
        this.reset();
        break;
      }
    }
  }

  reset() {
    this.accumulator = 0;
    this.jumpPending = false;
  }
}
