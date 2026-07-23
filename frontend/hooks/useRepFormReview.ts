"use client";

import { useEffect, useRef, useState } from "react";

import { ExerciseConfig } from "@/lib/exerciseConfig";
import { RepCounterState } from "@/hooks/useRepCounter";
import { detectMistakes, Mistake, primaryAngleOf } from "@/lib/liveMetrics";
import { JointAngles } from "@/types/pose";

export interface RepReview {
  repNumber: number;
  mistakes: Mistake[];
  inRange: boolean | null;
  peakAngle: number | null;
}

interface Params {
  angles: JointAngles | null;
  exercise: ExerciseConfig;
  repCounter: RepCounterState;
  running: boolean;
}

/**
 * Grades form once per rep, at the peak of the movement, instead of every frame.
 *
 * Comparing a live joint angle to a single static "optimal" is wrong for a
 * moving joint: it flags the whole descent/ascent of a rep as a mistake and
 * only agrees for the instant the joint passes through the target. That's what
 * made the old panel jitter every frame and hand out advice like "ease your
 * knee back" at the bottom of a good squat.
 *
 * Instead we snapshot every joint angle at the most-worked frame of each rep
 * (deepest flexion, or highest extension) and evaluate that. The result is
 * stable between reps and compares like-for-like: peak position vs optimal
 * peak.
 */
export function useRepFormReview({
  angles,
  exercise,
  repCounter,
  running,
}: Params): { lastRep: RepReview | null } {
  const [lastRep, setLastRep] = useState<RepReview | null>(null);

  const isFlexion = exercise.direction === "flexion";

  const prevRepsRef = useRef(repCounter.reps);
  const prevPhaseRef = useRef(repCounter.phase);
  const peakPrimaryRef = useRef<number | null>(null);
  const peakSnapshotRef = useRef<JointAngles | null>(null);

  // Track the most-worked frame throughout the working phase.
  useEffect(() => {
    if (!running || !angles) return;

    // A fresh working phase starts a new peak search.
    if (prevPhaseRef.current === "rest" && repCounter.phase === "working") {
      peakPrimaryRef.current = null;
      peakSnapshotRef.current = null;
    }
    prevPhaseRef.current = repCounter.phase;

    if (repCounter.phase !== "working") return;

    const primary = primaryAngleOf(angles, exercise);
    if (primary === null) return;

    const isNewPeak =
      peakPrimaryRef.current === null ||
      (isFlexion
        ? primary < peakPrimaryRef.current
        : primary > peakPrimaryRef.current);

    if (isNewPeak) {
      peakPrimaryRef.current = primary;
      peakSnapshotRef.current = angles;
    }
  }, [angles, running, repCounter.phase, exercise, isFlexion]);

  // On rep completion, freeze the review from the captured peak.
  useEffect(() => {
    if (repCounter.reps > prevRepsRef.current) {
      const snapshot = peakSnapshotRef.current;
      setLastRep({
        repNumber: repCounter.reps,
        mistakes: snapshot ? detectMistakes(snapshot, exercise) : [],
        inRange: repCounter.lastRepInRange,
        peakAngle: peakPrimaryRef.current,
      });
    } else if (repCounter.reps < prevRepsRef.current) {
      // Session reset — clear the scorecard.
      setLastRep(null);
    }
    prevRepsRef.current = repCounter.reps;
  }, [repCounter.reps, repCounter.lastRepInRange, exercise]);

  return { lastRep };
}
