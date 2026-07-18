import {
  FilesetResolver,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";

let poseLandmarker: PoseLandmarker | null = null;
let initPromise: Promise<PoseLandmarker> | null = null;

// Model accuracy vs. speed. "heavy" gives the best landmark accuracy the spec
// asks for but is the slowest; "full" is the balanced default that holds a
// usable frame rate on typical laptops. Flip to "heavy" if the machine can
// sustain it, or "lite" for low-power devices.
type PoseModel = "lite" | "full" | "heavy";
const POSE_MODEL: PoseModel = "full";

const MODEL_URL: Record<PoseModel, string> = {
  lite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
  full: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task",
  heavy:
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task",
};

// Detect up to 2 people so calibration can warn when another person is in frame.
const MAX_POSES = 2;

export async function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (poseLandmarker) {
    return poseLandmarker;
  }

  // Without this guard, two callers racing (e.g. React StrictMode's
  // dev-mode double effect invocation) would each create their own
  // PoseLandmarker + detection loop, doubling every state update.
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    // MediaPipe's WASM runtime logs routine init info (e.g. "Created
    // TensorFlow Lite XNNPACK delegate for CPU") through console.error.
    // Filter just that known-benign line so it doesn't surface as a
    // crash in the dev error overlay.
    const originalConsoleError = console.error;

    console.error = (...args: unknown[]) => {
      if (
        typeof args[0] === "string" &&
        args[0].includes("XNNPACK delegate")
      ) {
        return;
      }

      originalConsoleError(...args);
    };

    try {
      poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL[POSE_MODEL],
        },

        runningMode: "VIDEO",

        numPoses: MAX_POSES,

        minPoseDetectionConfidence: 0.5,

        minPosePresenceConfidence: 0.5,

        minTrackingConfidence: 0.5,

        // World landmarks (metric, hip-centered 3D) drive perspective-robust
        // joint-angle calculation and camera-geometry estimation.
        outputSegmentationMasks: false,
      });
    } finally {
      console.error = originalConsoleError;
    }

    return poseLandmarker;
  })();

  return initPromise;
}

export function resetPoseLandmarker() {
  if (poseLandmarker) {
    poseLandmarker.close();
    poseLandmarker = null;
  }

  initPromise = null;
}
