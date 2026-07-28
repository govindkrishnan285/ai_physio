// Adaptive pose calibration: evaluates the camera/environment/patient framing
// each frame, produces a 0-100 Pose Quality Score, and emits corrective
// instructions until the scene is good enough to begin analysis.
//
// Some geometric quantities (camera roll, distance) are heuristic estimates
// from body proportions rather than true intrinsics — good enough to guide the
// patient, and labelled as estimates in the UI.

import { FrameQuality } from "@/lib/frameQuality";
import { Landmark } from "@/types/pose";

export const DEFAULT_QUALITY_THRESHOLD = 75; // configurable enable-analysis gate
const RESUME_THRESHOLD_MARGIN = 12; // hysteresis so it doesn't flicker

// Landmark indices.
const NOSE = 0;
const L_SHOULDER = 11;
const R_SHOULDER = 12;
const L_ELBOW = 13;
const R_ELBOW = 14;
const L_WRIST = 15;
const R_WRIST = 16;
const L_HIP = 23;
const R_HIP = 24;
const L_KNEE = 25;
const R_KNEE = 26;
const L_ANKLE = 27;
const R_ANKLE = 28;

export type FocusRegion = "upper" | "lower" | "full";

// The landmarks that must be framed for each exercise focus. A knee rehab
// doesn't need the head; a shoulder rehab doesn't need the feet. Hips are in
// both because hip/shoulder angles are measured relative to the torso.
const REGION_BODY: Record<FocusRegion, number[]> = {
  full: [NOSE, L_SHOULDER, R_SHOULDER, L_HIP, R_HIP, L_KNEE, R_KNEE, L_ANKLE, R_ANKLE],
  lower: [L_SHOULDER, R_SHOULDER, L_HIP, R_HIP, L_KNEE, R_KNEE, L_ANKLE, R_ANKLE],
  upper: [L_SHOULDER, R_SHOULDER, L_ELBOW, R_ELBOW, L_WRIST, R_WRIST, L_HIP, R_HIP],
};

const REGION_LABEL: Record<FocusRegion, string> = {
  full: "your whole body — head to feet —",
  lower: "your lower body — hips to feet —",
  upper: "your upper body — shoulders to hands —",
};

export type CheckSeverity = "critical" | "warning";

export interface CalibrationCheck {
  id: string;
  label: string;
  pass: boolean;
  message: string; // corrective instruction when failing
  severity: CheckSeverity;
}

export interface CalibrationSubscores {
  visibility: number;
  confidence: number;
  lighting: number;
  cameraPosition: number;
  centering: number;
  stability: number;
  background: number;
}

export interface CameraGeometry {
  rollDeg: number;
  distance: "too close" | "good" | "too far" | "unknown";
  bodyScale: number; // fraction of frame height the body spans
}

export interface CalibrationReport {
  checks: CalibrationCheck[];
  subscores: CalibrationSubscores;
  qualityScore: number;
  ready: boolean;
  instructions: string[];
  geometry: CameraGeometry;
}

interface AnalyzeInput {
  landmarks: Landmark[] | null;
  poseCount: number;
  confidence: number; // mean visibility 0..1
  frame: FrameQuality | null;
  stability: number; // 0..1 (1 = rock steady)
  threshold: number;
  /** Which body region the exercise works — scopes the framing checks. */
  focus?: FocusRegion;
}

const vis = (lm: Landmark[], i: number) => lm[i]?.visibility ?? 0;
const inFrame = (lm: Landmark[], i: number) =>
  lm[i] && lm[i].x > 0.02 && lm[i].x < 0.98 && lm[i].y > 0.02 && lm[i].y < 0.98;

function bodyScale(lm: Landmark[], region: number[]): number {
  const ys = region.map((i) => lm[i]?.y).filter((y) => typeof y === "number");
  if (ys.length < 4) return 0;
  return Math.max(...ys) - Math.min(...ys);
}

function shoulderRollDeg(lm: Landmark[]): number {
  const l = lm[L_SHOULDER];
  const r = lm[R_SHOULDER];
  if (!l || !r) return 0;
  return (Math.atan2(r.y - l.y, r.x - l.x) * 180) / Math.PI;
}

function clamp(v: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, v));
}

export function analyzeCalibration({
  landmarks,
  poseCount,
  confidence,
  frame,
  stability,
  threshold,
  focus = "full",
}: AnalyzeInput): CalibrationReport {
  const checks: CalibrationCheck[] = [];
  const add = (
    id: string,
    label: string,
    pass: boolean,
    message: string,
    severity: CheckSeverity = "warning"
  ) => checks.push({ id, label, pass, message, severity });

  const hasPose = !!landmarks && landmarks.length >= 33;
  const lm = landmarks ?? [];
  const region = REGION_BODY[focus];
  const needsFeet = focus !== "upper";
  const needsHands = focus === "upper";

  // ---- Presence / visibility ----
  add(
    "person",
    "Patient detected",
    hasPose,
    "Step into the camera view so you can be detected.",
    "critical"
  );

  // Only the landmarks the exercise actually needs must be framed.
  const regionVisible = hasPose && region.every((i) => vis(lm, i) > 0.5);
  add(
    "fullBody",
    focus === "full" ? "Full body visible" : "Working area visible",
    regionVisible,
    `Keep ${REGION_LABEL[focus]} inside the frame.`,
    "critical"
  );

  // Feet only matter for lower-body / full exercises.
  if (needsFeet) {
    const feet =
      hasPose && vis(lm, L_ANKLE) > 0.5 && vis(lm, R_ANKLE) > 0.5 && lm[L_ANKLE].y < 0.98 && lm[R_ANKLE].y < 0.98;
    add("feet", "Both feet visible", feet, "Step back until both feet are inside the frame.", "critical");
  }

  // Hands are required for upper-body exercises, optional otherwise.
  const hands = hasPose && vis(lm, L_WRIST) > 0.4 && vis(lm, R_WRIST) > 0.4;
  add(
    "hands",
    "Both hands visible",
    hands,
    "Bring both hands into view.",
    needsHands ? "critical" : "warning"
  );

  // Head only matters when the whole body is in scope.
  if (focus === "full") {
    const head = hasPose && vis(lm, NOSE) > 0.5 && lm[NOSE].y > 0.02;
    add("head", "Head in frame", head, "Raise the camera so your head is inside the frame.");
  }

  // ---- Centering ---- (upper exercises center on the shoulders, else hips)
  const midX = !hasPose
    ? 0.5
    : focus === "upper"
      ? (lm[L_SHOULDER].x + lm[R_SHOULDER].x) / 2
      : (lm[L_HIP].x + lm[R_HIP].x) / 2;
  const centered = hasPose && midX > 0.34 && midX < 0.66;
  add(
    "centered",
    "Body centered",
    centered,
    midX <= 0.34 ? "Move to the right, into the center of the frame." : "Move to the left, into the center of the frame."
  );

  // ---- Distance / scale ---- (measured over the region actually in scope)
  const scale = hasPose ? bodyScale(lm, region) : 0;
  const tooClose = hasPose && scale > 0.96;
  const tooFar = hasPose && scale > 0 && scale < 0.5;
  add("distance", "Good distance", hasPose && !tooClose && !tooFar,
    tooClose ? "You're too close — move back about 30 cm." : tooFar ? "You're too far — move closer about 30 cm." : "Keep this distance.");

  // ---- Camera roll / framing ----
  const roll = hasPose ? shoulderRollDeg(lm) : 0;
  const level = Math.abs(roll) < 12;
  add("level", "Camera level", !hasPose || level,
    roll > 0 ? "Tilt the camera slightly counter-clockwise to level it." : "Tilt the camera slightly clockwise to level it.");

  // Only warn about a cut-off edge that this exercise actually needs framed.
  const feetCut = hasPose && needsFeet && (lm[L_ANKLE].y > 0.98 || lm[R_ANKLE].y > 0.98);
  const headCut = hasPose && focus === "full" && lm[NOSE].y < 0.04;
  add("framing", "Vertical framing", !hasPose || (!feetCut && !headCut),
    feetCut ? "Lower the camera or step back — your feet are cut off." : "Raise the camera — your head is cut off.");

  // ---- Occlusion / people ----
  add("single", "Only one person", poseCount <= 1, "Another person is in frame — clear the background.", "critical");

  // ---- Lighting ----
  const brightness = frame?.brightness ?? 0.5;
  const contrast = frame?.contrast ?? 0.5;
  const backlight = frame?.backlight ?? 0;
  const dark = brightness < 0.25;
  const bright = brightness > 0.9;
  add("lighting", "Adequate lighting", !dark && !bright,
    dark ? "The room is too dark — increase the lighting." : "The image is over-exposed — reduce the lighting.", "critical");
  add("backlight", "No harsh backlight", backlight < 0.5, "Strong backlight detected — face a light source or close the blinds behind you.");
  add("contrast", "Sufficient contrast", contrast > 0.08, "Low contrast — improve lighting or change your background.");

  // ---- Stability ----
  const steady = stability > 0.55;
  add("stability", "Camera steady", steady, "Hold the camera steady or place it on a stable surface.");

  // ---- Subscores (0-100) ---- (scored over the in-scope region)
  const visibleCount = hasPose ? region.filter((i) => vis(lm, i) > 0.5).length : 0;
  const visibility = clamp((visibleCount / region.length) * 100);
  const confidenceScore = clamp(confidence * 100);
  const lighting = clamp(
    100 - (dark ? 55 : 0) - (bright ? 40 : 0) - Math.max(0, (0.08 - contrast) * 400) - backlight * 40
  );
  const cameraPosition = clamp(
    100 - Math.min(60, Math.abs(roll) * 3) - (tooClose || tooFar ? 30 : 0) - (feetCut || headCut ? 20 : 0)
  );
  const centering = clamp(100 - Math.abs(midX - 0.5) * 320);
  const stabilityScore = clamp(stability * 100);
  const background = clamp(100 - (poseCount > 1 ? 50 : 0) - backlight * 40 - (contrast < 0.08 ? 20 : 0));

  const subscores: CalibrationSubscores = {
    visibility,
    confidence: confidenceScore,
    lighting,
    cameraPosition,
    centering,
    stability: stabilityScore,
    background,
  };

  const qualityScore = Math.round(
    visibility * 0.25 +
      confidenceScore * 0.2 +
      lighting * 0.15 +
      cameraPosition * 0.15 +
      centering * 0.1 +
      stabilityScore * 0.1 +
      background * 0.05
  );

  // Critical checks must all pass, in addition to clearing the score threshold.
  const criticalPass = checks
    .filter((c) => c.severity === "critical")
    .every((c) => c.pass);
  const ready = qualityScore >= threshold && criticalPass;

  const instructions = checks
    .filter((c) => !c.pass)
    .sort((a, b) => (a.severity === "critical" ? -1 : 1) - (b.severity === "critical" ? -1 : 1))
    .map((c) => c.message);

  return {
    checks,
    subscores,
    qualityScore,
    ready,
    instructions,
    geometry: {
      rollDeg: Math.round(roll),
      distance: !hasPose ? "unknown" : tooClose ? "too close" : tooFar ? "too far" : "good",
      bodyScale: Number(scale.toFixed(2)),
    },
  };
}

// During an active session, quality must fall well below the start threshold
// before we pause, and recover above it to resume (hysteresis).
export function shouldPauseForQuality(
  qualityScore: number,
  criticalOk: boolean,
  threshold: number
): boolean {
  return !criticalOk || qualityScore < threshold - RESUME_THRESHOLD_MARGIN;
}
