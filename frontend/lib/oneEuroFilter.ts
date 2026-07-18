// One-Euro filter for real-time landmark stabilization.
// Reference: Casiez, Roussel & Vogel (2012). Low latency + adaptive smoothing:
// smooths jitter when still, but tracks fast motion without lag — ideal for pose.

import { Landmark } from "@/types/pose";

class LowPass {
  private y: number | null = null;
  private s: number | null = null;

  filter(value: number, alpha: number): number {
    this.s =
      this.y === null ? value : alpha * value + (1 - alpha) * (this.s as number);
    this.y = value;
    return this.s;
  }

  hasLast(): boolean {
    return this.y !== null;
  }

  lastValue(): number {
    return this.s ?? 0;
  }

  reset(): void {
    this.y = null;
    this.s = null;
  }
}

export class OneEuroFilter {
  private xFilter = new LowPass();
  private dxFilter = new LowPass();
  private lastValue = 0;

  constructor(
    private minCutoff = 1.4,
    private beta = 0.007,
    private dCutoff = 1.0
  ) {}

  private alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  filter(value: number, dt: number): number {
    if (dt <= 0) dt = 1 / 30;
    const dValue = this.xFilter.hasLast()
      ? (value - this.lastValue) / dt
      : 0;
    const edValue = this.dxFilter.filter(dValue, this.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edValue);
    const filtered = this.xFilter.filter(value, this.alpha(cutoff, dt));
    this.lastValue = value;
    return filtered;
  }

  reset(): void {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastValue = 0;
  }
}

const LANDMARK_COUNT = 33;
const VISIBILITY_MIN = 0.35; // below this, treat landmark as unreliable
const OUTLIER_JUMP = 0.18; // normalized-coord jump that, with low vis, is rejected

/**
 * Stabilizes the full 33-landmark pose each frame:
 *  - One-Euro temporal smoothing per x/y/z (kills jitter, floating joints)
 *  - confidence weighting: low-visibility landmarks hold their last good position
 *  - outlier rejection: implausible single-frame jumps are ignored
 *  - missing interpolation: undetected landmarks reuse the last stable value
 */
export class LandmarkStabilizer {
  private fx: OneEuroFilter[] = [];
  private fy: OneEuroFilter[] = [];
  private fz: OneEuroFilter[] = [];
  private last: Landmark[] | null = null;

  constructor() {
    for (let i = 0; i < LANDMARK_COUNT; i++) {
      this.fx.push(new OneEuroFilter());
      this.fy.push(new OneEuroFilter());
      this.fz.push(new OneEuroFilter());
    }
  }

  reset(): void {
    this.fx.forEach((f) => f.reset());
    this.fy.forEach((f) => f.reset());
    this.fz.forEach((f) => f.reset());
    this.last = null;
  }

  apply(landmarks: Landmark[], dt: number): Landmark[] {
    const out: Landmark[] = new Array(landmarks.length);

    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      const vis = lm.visibility ?? 1;
      const prev = this.last?.[i];

      // Missing / very-low-confidence: hold the last stable value if we have one.
      if (vis < VISIBILITY_MIN && prev) {
        out[i] = { ...prev, visibility: vis };
        continue;
      }

      // Outlier: a big jump on a not-very-confident landmark is likely a glitch.
      if (prev && vis < 0.6) {
        const jump = Math.hypot(lm.x - prev.x, lm.y - prev.y);
        if (jump > OUTLIER_JUMP) {
          out[i] = { ...prev, visibility: vis };
          continue;
        }
      }

      out[i] = {
        x: this.fx[i].filter(lm.x, dt),
        y: this.fy[i].filter(lm.y, dt),
        z: this.fz[i].filter(lm.z ?? 0, dt),
        visibility: vis,
      };
    }

    this.last = out;
    return out;
  }
}
