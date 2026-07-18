import { ExerciseConfig } from "@/lib/exerciseConfig";
import { JointAngles, JointAngleKey } from "@/types/pose";

export type Severity = "correct" | "slight" | "incorrect";

// Green = correct, Yellow = slight deviation, Red = incorrect.
export const SEVERITY_STYLE: Record<
  Severity,
  { text: string; bg: string; border: string; dot: string; label: string }
> = {
  correct: {
    text: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-800",
    dot: "bg-emerald-500",
    label: "Correct",
  },
  slight: {
    text: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-800",
    dot: "bg-amber-500",
    label: "Slight deviation",
  },
  incorrect: {
    text: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-900",
    dot: "bg-rose-500",
    label: "Incorrect",
  },
};

const SLIGHT_DEG = 8;
const INCORRECT_DEG = 18;

export function severityForDiff(diff: number): Severity {
  const d = Math.abs(diff);
  if (d <= SLIGHT_DEG) return "correct";
  if (d <= INCORRECT_DEG) return "slight";
  return "incorrect";
}

export const JOINT_LABELS: Record<JointAngleKey, string> = {
  leftKnee: "Left Knee",
  rightKnee: "Right Knee",
  leftHip: "Left Hip",
  rightHip: "Right Hip",
  leftShoulder: "Left Shoulder",
  rightShoulder: "Right Shoulder",
  leftElbow: "Left Elbow",
  rightElbow: "Right Elbow",
};

export const JOINT_ORDER: JointAngleKey[] = [
  "leftKnee",
  "rightKnee",
  "leftHip",
  "rightHip",
  "leftShoulder",
  "rightShoulder",
  "leftElbow",
  "rightElbow",
];

// base joint (side stripped) -> correction phrasing.
// "above" = measured angle greater than optimal; "below" = less than optimal.
const CORRECTIONS: Record<
  string,
  { above: (side: string, d: number) => string; below: (side: string, d: number) => string }
> = {
  knee: {
    above: (s, d) => `Bend your ${s} knee another ${d}°`,
    below: (s, d) => `Ease your ${s} knee back ${d}°`,
  },
  hip: {
    above: (s, d) => `Hinge your ${s} hip ${d}° more`,
    below: (s, d) => `Reduce your ${s} hip bend ${d}°`,
  },
  shoulder: {
    above: (s, d) => `Lower your ${s} shoulder ${d}°`,
    below: (s, d) => `Raise your ${s} shoulder ${d}° higher`,
  },
  elbow: {
    above: (s, d) => `Straighten your ${s} elbow ${d}°`,
    below: (s, d) => `Bend your ${s} elbow ${d}° more`,
  },
};

function splitJoint(key: JointAngleKey): { side: string; base: string } {
  const side = key.startsWith("left") ? "left" : "right";
  const base = key.replace("left", "").replace("right", "").toLowerCase();
  return { side, base };
}

export interface JointReading {
  key: JointAngleKey;
  label: string;
  current: number;
  target: number | null;
  diff: number | null; // current - target
  severity: Severity | null;
}

export function jointReadings(
  angles: JointAngles,
  exercise: ExerciseConfig
): JointReading[] {
  return JOINT_ORDER.map((key) => {
    const current = angles[key];
    const target = exercise.optimalAngles[key] ?? null;
    if (target === null) {
      return { key, label: JOINT_LABELS[key], current, target: null, diff: null, severity: null };
    }
    const diff = current - target;
    return {
      key,
      label: JOINT_LABELS[key],
      current,
      target,
      diff,
      severity: severityForDiff(diff),
    };
  });
}

export interface Mistake {
  key: JointAngleKey;
  label: string;
  current: number;
  optimal: number;
  diff: number; // current - optimal
  severity: Severity; // slight | incorrect
  correction: string;
}

export function detectMistakes(
  angles: JointAngles,
  exercise: ExerciseConfig
): Mistake[] {
  const mistakes: Mistake[] = [];
  for (const key of JOINT_ORDER) {
    const optimal = exercise.optimalAngles[key];
    if (optimal === undefined) continue;
    const current = angles[key];
    const diff = current - optimal;
    const severity = severityForDiff(diff);
    if (severity === "correct") continue;

    const { side, base } = splitJoint(key);
    const tmpl = CORRECTIONS[base];
    const d = Math.round(Math.abs(diff));
    const correction = tmpl
      ? diff > 0
        ? tmpl.above(side, d)
        : tmpl.below(side, d)
      : `Adjust ${JOINT_LABELS[key]} by ${d}°`;

    mistakes.push({
      key,
      label: JOINT_LABELS[key],
      current: Math.round(current),
      optimal,
      diff: Math.round(diff),
      severity,
      correction,
    });
  }
  // Worst first.
  return mistakes.sort(
    (a, b) => (b.severity === "incorrect" ? 1 : 0) - (a.severity === "incorrect" ? 1 : 0)
  );
}

export function primaryAngleOf(
  angles: JointAngles | null,
  exercise: ExerciseConfig
): number | null {
  if (!angles || exercise.jointKeys.length === 0) return null;
  const sum = exercise.jointKeys.reduce((acc, k) => acc + angles[k], 0);
  return sum / exercise.jointKeys.length;
}

export function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}
