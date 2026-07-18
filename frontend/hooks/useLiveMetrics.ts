"use client";

import { useEffect, useRef, useState } from "react";

import { PoseState } from "@/hooks/usePoseDetection";
import { RepCounterState } from "@/hooks/useRepCounter";
import { AnalyzeRepResponse } from "@/lib/api";
import { ExerciseConfig } from "@/lib/exerciseConfig";
import {
  clamp,
  detectMistakes,
  jointReadings,
  JointReading,
  Mistake,
  primaryAngleOf,
} from "@/lib/liveMetrics";
import { JointAngles } from "@/types/pose";

export type MovementPhase =
  | "Start"
  | "Descending"
  | "Ascending"
  | "Hold"
  | "Completed";

export interface LiveMetrics {
  phase: MovementPhase;
  primaryAngle: number | null;
  currentRom: number;
  targetRom: number;
  completionPct: number;
  targetReps: number;
  movementQuality: number;
  accuracy: number;
  stability: number;
  balance: number;
  calories: number;
  jointReadings: JointReading[];
  mistakes: Mistake[];
}

const HOLD_DEADBAND_DEG_S = 10; // |velocity| below this while worked => Hold
const VEL_WINDOW = 12;

function std(values: number[]): number {
  if (values.length < 2) return 0;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length;
  return Math.sqrt(v);
}

function symmetryBalance(angles: JointAngles): number {
  const diffs = [
    Math.abs(angles.leftKnee - angles.rightKnee),
    Math.abs(angles.leftHip - angles.rightHip),
    Math.abs(angles.leftShoulder - angles.rightShoulder),
    Math.abs(angles.leftElbow - angles.rightElbow),
  ];
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  return Math.round(clamp(100 - mean * 2));
}

interface Params {
  angles: JointAngles | null;
  exercise: ExerciseConfig;
  running: boolean;
  pose: PoseState;
  repCounter: RepCounterState;
  elapsedSec: number;
  serverFeedback: AnalyzeRepResponse | null;
}

/**
 * Derives every live rehabilitation metric from the raw pose/rep signals:
 * movement phase, ROM vs target, completion, movement-quality/stability/balance
 * scores, calories, per-joint readings (vs optimal), and detected mistakes.
 */
export function useLiveMetrics({
  angles,
  exercise,
  running,
  pose,
  repCounter,
  elapsedSec,
  serverFeedback,
}: Params): LiveMetrics {
  const [phase, setPhase] = useState<MovementPhase>("Start");
  const [stability, setStability] = useState(0);

  const prevAngleRef = useRef<number | null>(null);
  const prevTimeRef = useRef<number>(0);
  const velWindowRef = useRef<number[]>([]);

  const primaryAngle = primaryAngleOf(angles, exercise);
  const targetMid = (exercise.targetRange[0] + exercise.targetRange[1]) / 2;
  const targetRom = Math.abs(exercise.restThreshold - targetMid);

  const isFlexion = exercise.direction === "flexion";

  // Phase + stability update loop (driven by the pose frame rate).
  useEffect(() => {
    if (!running || primaryAngle === null) {
      setPhase(running ? "Start" : "Start");
      prevAngleRef.current = null;
      velWindowRef.current = [];
      setStability(0);
      return;
    }

    if (repCounter.reps >= exercise.targetReps) {
      setPhase("Completed");
    }

    const now = performance.now();
    let velocity = 0;
    if (prevAngleRef.current !== null && prevTimeRef.current > 0) {
      const dt = (now - prevTimeRef.current) / 1000;
      if (dt > 0) velocity = (primaryAngle - prevAngleRef.current) / dt;
    }
    prevAngleRef.current = primaryAngle;
    prevTimeRef.current = now;

    const win = velWindowRef.current;
    win.push(velocity);
    if (win.length > VEL_WINDOW) win.shift();
    setStability(Math.round(clamp(100 - std(win) * 0.4)));

    if (repCounter.reps < exercise.targetReps) {
      const inWorked = isFlexion
        ? primaryAngle <= exercise.workThreshold
        : primaryAngle >= exercise.workThreshold;
      const atRest = isFlexion
        ? primaryAngle >= exercise.restThreshold - 5
        : primaryAngle <= exercise.restThreshold + 5;

      if (Math.abs(velocity) < HOLD_DEADBAND_DEG_S && inWorked) {
        setPhase("Hold");
      } else if (atRest && Math.abs(velocity) < HOLD_DEADBAND_DEG_S) {
        setPhase("Start");
      } else if (velocity > 0) {
        setPhase("Ascending");
      } else if (velocity < 0) {
        setPhase("Descending");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryAngle, running, repCounter.reps]);

  const currentRom =
    running && primaryAngle !== null
      ? Math.round(Math.abs(exercise.restThreshold - primaryAngle))
      : Math.round(repCounter.bestRom ?? 0);

  const completionPct = Math.min(
    100,
    Math.round((repCounter.reps / Math.max(1, exercise.targetReps)) * 100)
  );

  const movementQuality = Math.round(
    serverFeedback?.accuracy ?? repCounter.accuracy
  );
  const accuracy = Math.round(repCounter.accuracy);
  const balance = angles ? symmetryBalance(angles) : 0;
  const calories = Number(((elapsedSec / 60) * 4.0).toFixed(1));

  const readings = angles ? jointReadings(angles, exercise) : [];
  const mistakes = running && angles ? detectMistakes(angles, exercise) : [];

  return {
    phase,
    primaryAngle,
    currentRom,
    targetRom: Math.round(targetRom),
    completionPct,
    targetReps: exercise.targetReps,
    movementQuality,
    accuracy,
    stability,
    balance,
    calories,
    jointReadings: readings,
    mistakes,
  };
}
