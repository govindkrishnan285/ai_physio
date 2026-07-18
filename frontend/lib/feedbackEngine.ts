import { RepCounterState } from "@/hooks/useRepCounter";
import { ExerciseConfig } from "@/lib/exerciseConfig";
import { PoseState } from "@/hooks/usePoseDetection";

export interface FeedbackItem {
  text: string;
  success: boolean;
}

export interface Correction {
  text: string;
  tone: "idle" | "success" | "warning";
}

export interface FeedbackResult {
  status: "idle" | "success" | "warning";
  statusText: string;
  /** The single most important, actionable instruction right now (e.g. "Lift your arm higher"). */
  correction: Correction;
  items: FeedbackItem[];
}

export function getFeedback(
  exercise: ExerciseConfig,
  repCounter: RepCounterState,
  pose: PoseState,
  running: boolean
): FeedbackResult {
  if (exercise.supported === false) {
    return {
      status: "idle",
      statusText: "Tracking not available yet for this exercise",
      correction: {
        text: "This exercise needs landmarks (e.g. head/face) this app doesn't track yet.",
        tone: "idle",
      },
      items: [],
    };
  }

  if (!running) {
    return {
      status: "idle",
      statusText: "Waiting for camera...",
      correction: {
        text: "Click Start Session to begin tracking.",
        tone: "idle",
      },
      items: [],
    };
  }

  if (!pose.isTracking) {
    return {
      status: "warning",
      statusText: "No person detected",
      correction: {
        text: "Step fully into frame so your whole body is visible.",
        tone: "warning",
      },
      items: [],
    };
  }

  const items: FeedbackItem[] = [];
  const [min, max] = exercise.targetRange;
  const angle = repCounter.currentAngle;
  const isFlexion = exercise.direction === "flexion";

  let correction: Correction = {
    text: "Waiting for movement...",
    tone: "idle",
  };

  if (angle !== null) {
    if (repCounter.phase === "working") {
      const tooShallow = isFlexion ? angle > max : angle < min;
      const tooDeep = isFlexion ? angle < min : angle > max;

      if (tooShallow) {
        correction = { text: exercise.cues.tooShallow, tone: "warning" };
      } else if (tooDeep) {
        correction = { text: exercise.cues.tooDeep, tone: "warning" };
      } else {
        correction = { text: exercise.cues.goodForm, tone: "success" };
      }
    } else {
      correction = { text: "Ready — begin your next rep.", tone: "success" };
    }
  }

  if (repCounter.lastRepInRange === true) {
    items.push({ text: "Last rep hit the target range. Nice work.", success: true });
  } else if (repCounter.lastRepInRange === false) {
    items.push({
      text: "Last rep missed the target range — focus on control over speed.",
      success: false,
    });
  }

  if (repCounter.reps >= 3 && repCounter.accuracy < 70) {
    items.push({
      text: "Accuracy is below 70% — slow the movement down.",
      success: false,
    });
  }

  const hasWarning =
    correction.tone === "warning" || items.some((item) => !item.success);

  return {
    status: hasWarning ? "warning" : "success",
    statusText: hasWarning ? "Adjust your form" : "Good posture",
    correction,
    items: items.slice(0, 4),
  };
}
