"use client";

import { useEffect, useRef, useState } from "react";
import { ExerciseConfig } from "@/lib/exerciseConfig";
import { JointAngles } from "@/types/pose";

export interface RepCounterState {
  reps: number;
  phase: "rest" | "working";
  currentAngle: number | null;
  peakAngleThisRep: number | null;
  lastRepInRange: boolean | null;
  accuracy: number;
  bestRom: number | null;
}

const initialState: RepCounterState = {
  reps: 0,
  phase: "rest",
  currentAngle: null,
  peakAngleThisRep: null,
  lastRepInRange: null,
  accuracy: 0,
  bestRom: null,
};

export function useRepCounter(
  angles: JointAngles | null,
  exercise: ExerciseConfig | null,
  active: boolean,
  resetToken: number = 0
): RepCounterState {
  const [state, setState] = useState<RepCounterState>(initialState);

  const goodReps = useRef(0);
  const totalReps = useRef(0);
  const peakAngle = useRef<number | null>(null);
  const phase = useRef<"rest" | "working">("rest");
  const bestRom = useRef<number | null>(null);

  useEffect(() => {
    goodReps.current = 0;
    totalReps.current = 0;
    peakAngle.current = null;
    phase.current = "rest";
    bestRom.current = null;
    setState(initialState);
  }, [exercise?.name, resetToken]);

  useEffect(() => {
    if (!active || !angles || !exercise || exercise.supported === false) {
      return;
    }

    if (exercise.jointKeys.length === 0) return;

    const angle =
      exercise.jointKeys.reduce((sum, key) => sum + angles[key], 0) /
      exercise.jointKeys.length;

    const isFlexion = exercise.direction === "flexion";

    const enteredWork = isFlexion
      ? angle < exercise.workThreshold
      : angle > exercise.workThreshold;

    const backToRest = isFlexion
      ? angle > exercise.restThreshold
      : angle < exercise.restThreshold;

    if (phase.current === "rest" && enteredWork) {
      phase.current = "working";
      peakAngle.current = angle;
    } else if (phase.current === "working") {
      if (peakAngle.current === null) {
        peakAngle.current = angle;
      } else if (isFlexion ? angle < peakAngle.current : angle > peakAngle.current) {
        peakAngle.current = angle;
      }

      if (backToRest) {
        const peak = peakAngle.current ?? angle;
        const inRange =
          peak >= exercise.targetRange[0] && peak <= exercise.targetRange[1];

        totalReps.current += 1;
        if (inRange) goodReps.current += 1;

        bestRom.current =
          bestRom.current === null
            ? peak
            : isFlexion
              ? Math.min(bestRom.current, peak)
              : Math.max(bestRom.current, peak);

        phase.current = "rest";

        setState({
          reps: totalReps.current,
          phase: "rest",
          currentAngle: angle,
          peakAngleThisRep: peak,
          lastRepInRange: inRange,
          accuracy: Math.round(
            (goodReps.current / totalReps.current) * 100
          ),
          bestRom: bestRom.current,
        });

        peakAngle.current = null;
        return;
      }
    }

    setState((prev) => ({
      ...prev,
      phase: phase.current,
      currentAngle: angle,
      peakAngleThisRep: peakAngle.current,
    }));
  }, [angles, active, exercise]);

  return state;
}
