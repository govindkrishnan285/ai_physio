"use client";

import { useEffect, useRef, useState } from "react";

import { ExerciseConfig } from "@/lib/exerciseConfig";
import { MovementPhase } from "@/hooks/useLiveMetrics";
import { RepCounterState } from "@/hooks/useRepCounter";
import { JointAngles, JointAngleKey } from "@/types/pose";

export type CueTone = "idle" | "success" | "warning";
export interface LiveCue {
  text: string;
  tone: CueTone;
}

// Only signals that are meaningful *at any point in the rep* belong here —
// symmetry, tempo, safety — plus positive, phase-aware depth cues. Detailed
// per-joint corrections stay in the post-rep review, where the comparison is
// like-for-like.
const SYMMETRY_WARN_DEG = 20; // left/right primary-joint gap that warrants a nudge
const JERKY_STABILITY = 25; // movement-stability score below this reads as jerky
const MIN_HOLD_MS = 700; // keep a cue on screen at least this long, to stop flicker

interface Params {
  angles: JointAngles | null;
  exercise: ExerciseConfig;
  phase: MovementPhase;
  stability: number;
  repCounter: RepCounterState;
  running: boolean;
  isTracking: boolean;
}

interface Candidate extends LiveCue {
  // Higher priority may pre-empt the min-hold (e.g. a safety cue interrupts).
  priority: number;
}

function baseOf(key: JointAngleKey): string {
  return key.replace("left", "").replace("right", "").toLowerCase();
}
function sideOf(key: JointAngleKey): string {
  return key.startsWith("left") ? "left" : "right";
}

function computeCandidate(p: Params): Candidate {
  const { angles, exercise, phase, stability, repCounter, running, isTracking } = p;

  if (!running) return { text: "Click Start Session to begin.", tone: "idle", priority: 0 };
  if (!isTracking || !angles)
    return { text: "Step fully into frame.", tone: "warning", priority: 5 };

  // Between reps — nothing to coach mid-movement.
  if (repCounter.phase !== "working")
    return { text: "Ready — begin your next rep.", tone: "idle", priority: 1 };

  // 1) Symmetry on the primary joint pair — wrong at any point in the rep.
  const left = exercise.jointKeys.find((k) => k.startsWith("left"));
  const right = exercise.jointKeys.find((k) => k.startsWith("right"));
  if (left && right && baseOf(left) === baseOf(right)) {
    const diff = Math.abs(angles[left] - angles[right]);
    if (diff > SYMMETRY_WARN_DEG) {
      // For flexion the larger angle is the less-worked (lagging) side; for
      // extension it's the smaller one.
      const isFlexion = exercise.direction === "flexion";
      const lagging =
        (isFlexion ? angles[left] > angles[right] : angles[left] < angles[right])
          ? left
          : right;
      return {
        text: `Even them out — your ${sideOf(lagging)} ${baseOf(lagging)} is lagging.`,
        tone: "warning",
        priority: 3,
      };
    }
  }

  // 2) Tempo — jerky/rushed movement, also phase-independent.
  if (stability > 0 && stability < JERKY_STABILITY)
    return { text: "Slow it down — smooth, controlled reps.", tone: "warning", priority: 3 };

  // 3) Depth, framed positively and never nagging on the way back up.
  const [min, max] = exercise.targetRange;
  const angle = repCounter.currentAngle;
  const atDepth = angle !== null && angle >= min && angle <= max;
  if (atDepth || phase === "Hold")
    return { text: exercise.cues.goodForm, tone: "success", priority: 2 };
  if (phase === "Ascending")
    return { text: "Control the return — don't let it drop.", tone: "success", priority: 1 };
  return { text: "Keep reaching toward your depth.", tone: "idle", priority: 1 };
}

/**
 * A single, calm, real-time coaching cue for the live-correction ticker.
 *
 * Motor-learning-wise, detailed correction belongs *after* the rep (the review
 * panel), so this stays deliberately minimal: one line at a time, only for
 * things valid mid-movement, held for a beat so it never flickers.
 */
export function useLiveCue(p: Params): LiveCue {
  const [cue, setCue] = useState<LiveCue>({ text: "", tone: "idle" });
  const held = useRef({ text: "", priority: -1, since: 0 });

  useEffect(() => {
    const cand = computeCandidate(p);
    const now = performance.now();

    // Switch when the message actually changed AND either it outranks what's
    // showing or the current cue has had its minimum time on screen.
    const changed = cand.text !== held.current.text;
    const maySwitch =
      cand.priority > held.current.priority ||
      now - held.current.since >= MIN_HOLD_MS;

    if (changed && maySwitch) {
      held.current = { text: cand.text, priority: cand.priority, since: now };
      setCue({ text: cand.text, tone: cand.tone });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    p.angles,
    p.phase,
    p.stability,
    p.running,
    p.isTracking,
    p.exercise,
    p.repCounter.phase,
    p.repCounter.currentAngle,
  ]);

  return cue;
}
