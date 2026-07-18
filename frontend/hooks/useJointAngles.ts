"use client";

import { useMemo } from "react";
import { getJointAngles, getJointAnglesWorld } from "@/lib/angleCalculator";
import { Landmark } from "@/types/pose";

// Prefer metric world landmarks (perspective-robust, scale-invariant); fall back
// to 2D image landmarks when world landmarks aren't available.
export function useJointAngles(
  landmarks: Landmark[] | null,
  worldLandmarks: Landmark[] | null = null
) {
  return useMemo(() => {
    const world = getJointAnglesWorld(worldLandmarks);
    if (world) return world;
    return getJointAngles(landmarks);
  }, [landmarks, worldLandmarks]);
}
