"use client";

import { useEffect, useRef, useState } from "react";
import { PoseLandmarker } from "@mediapipe/tasks-vision";
import Webcam from "react-webcam";
import { getPoseLandmarker } from "@/lib/mediapipe";
import { LandmarkStabilizer } from "@/lib/oneEuroFilter";
import { Landmark } from "@/types/pose";

export interface PoseState {
  /** Stabilized normalized image landmarks (for drawing + 2D metrics). */
  landmarks: Landmark[] | null;
  /** Metric, hip-centered 3D world landmarks (for perspective-robust angles). */
  worldLandmarks: Landmark[] | null;
  fps: number;
  isTracking: boolean;
  confidence: number;
  /** Number of people detected in the frame (for calibration multi-person check). */
  poseCount: number;
}

const EMPTY: PoseState = {
  landmarks: null,
  worldLandmarks: null,
  fps: 0,
  isTracking: false,
  confidence: 0,
  poseCount: 0,
};

// Cap React state commits well below the render rate. detectForVideo still runs
// every available frame; only the state update (and app-wide re-render) is
// throttled. The One-Euro stabilizer runs at this cadence with a consistent dt.
const STATE_COMMIT_INTERVAL_MS = 66;

const L_HIP = 23;
const R_HIP = 24;

function meanVisibility(landmarks: Landmark[]): number {
  if (landmarks.length === 0) return 0;
  const sum = landmarks.reduce((acc, l) => acc + (l.visibility ?? 0), 0);
  return sum / landmarks.length;
}

// When several people are detected, treat the most-centered one as the patient.
function pickPatientIndex(poses: Landmark[][]): number {
  let best = 0;
  let bestDist = Infinity;
  poses.forEach((lm, i) => {
    if (lm.length <= R_HIP) return;
    const midX = (lm[L_HIP].x + lm[R_HIP].x) / 2;
    const dist = Math.abs(midX - 0.5);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  return best;
}

export function usePoseDetection(
  webcamRef: React.RefObject<Webcam | null>,
  active: boolean
) {
  const animationRef = useRef<number | null>(null);
  const lastFrameTime = useRef(performance.now());
  const lastDetectTimestamp = useRef(0);
  const lastStateCommit = useRef(0);
  const poseLandmarker = useRef<PoseLandmarker | null>(null);
  const stabilizer = useRef<LandmarkStabilizer>(new LandmarkStabilizer());

  const [poseState, setPoseState] = useState<PoseState>(EMPTY);

  useEffect(() => {
    if (!active) {
      stabilizer.current.reset();
      setPoseState(EMPTY);
      return;
    }

    let cancelled = false;

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    async function initialize() {
      poseLandmarker.current = await getPoseLandmarker();
      if (!cancelled) detectLoop();
    }

    initialize();

    return () => {
      cancelled = true;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };

    function detectLoop() {
      if (cancelled) return;

      const video = webcamRef.current?.video;
      // Skip until the video is both ready AND has real frame dimensions.
      // Calling detectForVideo on a 0x0 frame crashes MediaPipe's image
      // pipeline ("ROI width and height must be > 0") every animation frame.
      if (
        !video ||
        video.readyState !== 4 ||
        video.videoWidth === 0 ||
        video.videoHeight === 0
      ) {
        animationRef.current = requestAnimationFrame(detectLoop);
        return;
      }

      const now = performance.now();

      // VIDEO mode requires strictly increasing timestamps.
      if (now <= lastDetectTimestamp.current) {
        animationRef.current = requestAnimationFrame(detectLoop);
        return;
      }
      lastDetectTimestamp.current = now;

      let result;
      try {
        result = poseLandmarker.current?.detectForVideo(video, now);
      } catch {
        animationRef.current = requestAnimationFrame(detectLoop);
        return;
      }

      const fps = 1000 / (now - lastFrameTime.current);
      lastFrameTime.current = now;

      if (now - lastStateCommit.current >= STATE_COMMIT_INTERVAL_MS) {
        const dt = (now - lastStateCommit.current) / 1000;
        lastStateCommit.current = now;

        if (result && result.landmarks && result.landmarks.length > 0) {
          const poses = result.landmarks as Landmark[][];
          const world = (result.worldLandmarks ?? []) as Landmark[][];
          const idx = pickPatientIndex(poses);

          const stabilized = stabilizer.current.apply(poses[idx], dt);

          setPoseState({
            landmarks: stabilized,
            worldLandmarks: world[idx] ?? null,
            fps: Math.round(fps),
            isTracking: true,
            confidence: meanVisibility(stabilized),
            poseCount: poses.length,
          });
        } else {
          stabilizer.current.reset();
          // Once untracked, stay on the same state object. Re-allocating it
          // every commit re-rendered the whole app ~15x/sec for as long as
          // nobody was in frame. Cost: the fps readout freezes while
          // untracked, which is the more honest reading anyway.
          setPoseState((prev) =>
            !prev.isTracking && prev.landmarks === null
              ? prev
              : {
                  landmarks: null,
                  worldLandmarks: null,
                  fps: Math.round(fps),
                  isTracking: false,
                  confidence: 0,
                  poseCount: 0,
                }
          );
        }
      }

      animationRef.current = requestAnimationFrame(detectLoop);
    }
  }, [webcamRef, active]);

  return poseState;
}
