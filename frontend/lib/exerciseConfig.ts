import { JointAngleKey } from "@/types/pose";

export interface ExerciseConfig {
  name: string;
  category: string;
  jointKeys: JointAngleKey[];
  /**
   * "flexion": the worked position is a SMALLER angle than rest (e.g. a knee bend).
   * "extension": the worked position is a LARGER angle than rest (e.g. raising an arm).
   */
  direction: "flexion" | "extension";
  /**
   * Which part of the body the exercise actually works. Drives what the camera
   * must frame (calibration) and which joints/metrics are shown — e.g. a knee
   * rehab doesn't need your head in frame, a shoulder rehab doesn't need feet.
   */
  focus: "upper" | "lower" | "full";
  restThreshold: number;
  workThreshold: number;
  targetRange: [number, number];
  /** Target number of repetitions for one session. */
  targetReps: number;
  instructions: string;
  /**
   * Specific, actionable corrective cues shown to the user while they move,
   * phrased as a direct instruction (e.g. "Lift your arm higher") rather than
   * a generic "increase the angle" message.
   */
  cues: {
    /** Angle hasn't reached the target range yet (needs more motion). */
    tooShallow: string;
    /** Angle has gone past the target range (needs to ease back). */
    tooDeep: string;
    /** Angle is within the target range. */
    goodForm: string;
  };
  /**
   * Optimal per-joint angles (degrees) at the worked position. Used to display
   * "Target: X°" next to each live joint angle and to detect posture mistakes.
   * Only joints listed here are color-coded against a target; others show live-only.
   */
  optimalAngles: Partial<Record<JointAngleKey, number>>;
  /**
   * False when the exercise needs landmarks/angles this app doesn't compute yet
   * (e.g. neck rotation needs head landmarks, not just shoulder/hip/knee/elbow angles).
   * The UI should say tracking isn't available yet instead of faking a metric.
   */
  supported?: boolean;
}

export const exercises: ExerciseConfig[] = [
  {
    name: "ACL Rehabilitation",
    category: "Knee",
    jointKeys: ["leftKnee", "rightKnee"],
    direction: "flexion",
    focus: "lower",
    restThreshold: 160,
    workThreshold: 130,
    targetRange: [80, 110],
    targetReps: 12,
    instructions:
      "Slowly bend both knees into a controlled squat, then return to standing.",
    cues: {
      tooShallow: "Bend your knees deeper, like sitting back into a chair.",
      tooDeep: "Ease up slightly — that's deeper than the safe target range.",
      goodForm: "Good depth — hold briefly, then rise back up with control.",
    },
    optimalAngles: { leftKnee: 95, rightKnee: 95, leftHip: 100, rightHip: 100 },
  },
  {
    name: "Meniscus Rehabilitation",
    category: "Knee",
    jointKeys: ["leftKnee", "rightKnee"],
    direction: "flexion",
    focus: "lower",
    restThreshold: 160,
    workThreshold: 140,
    targetRange: [110, 140],
    targetReps: 12,
    instructions:
      "Perform a shallow, pain-free knee bend, keeping the motion slow and controlled.",
    cues: {
      tooShallow: "Bend your knees a little more — keep it gentle and pain-free.",
      tooDeep: "That's deeper than recommended here — straighten up slightly.",
      goodForm: "Good shallow bend — hold, then straighten slowly.",
    },
    optimalAngles: { leftKnee: 125, rightKnee: 125, leftHip: 140, rightHip: 140 },
  },
  {
    name: "Shoulder Abduction",
    category: "Shoulder",
    jointKeys: ["leftShoulder", "rightShoulder"],
    direction: "extension",
    focus: "upper",
    restThreshold: 30,
    workThreshold: 60,
    targetRange: [80, 160],
    targetReps: 12,
    instructions:
      "Raise both arms out to the side, up to shoulder height or above.",
    cues: {
      tooShallow: "Lift your arms higher out to the sides, toward shoulder height.",
      tooDeep: "Your arms are raised past a safe range — lower them slightly.",
      goodForm: "Great height — hold briefly, then lower with control.",
    },
    optimalAngles: {
      leftShoulder: 120,
      rightShoulder: 120,
      leftElbow: 170,
      rightElbow: 170,
    },
  },
  {
    name: "Rotator Cuff Rehab",
    category: "Shoulder",
    jointKeys: ["leftShoulder", "rightShoulder"],
    direction: "extension",
    focus: "upper",
    restThreshold: 20,
    workThreshold: 45,
    targetRange: [60, 100],
    targetReps: 12,
    instructions:
      "Rotate and raise the arm slowly, keeping the elbow close and stable.",
    cues: {
      tooShallow: "Raise your arm a little higher, keeping the elbow close to your side.",
      tooDeep: "You've raised past the target range — bring your arm down slightly.",
      goodForm: "Good position — hold, then lower slowly.",
    },
    optimalAngles: {
      leftShoulder: 80,
      rightShoulder: 80,
      leftElbow: 90,
      rightElbow: 90,
    },
  },
  {
    name: "Stroke Rehabilitation",
    category: "Neurological",
    jointKeys: ["leftElbow", "rightElbow"],
    direction: "extension",
    focus: "upper",
    restThreshold: 90,
    workThreshold: 120,
    targetRange: [150, 180],
    targetReps: 10,
    instructions:
      "Reach forward slowly, straightening the elbow, then return with control.",
    cues: {
      tooShallow: "Straighten your elbow further as you reach forward.",
      tooDeep: "Ease off slightly — avoid locking the elbow too hard.",
      goodForm: "Nice full reach — now return with control.",
    },
    optimalAngles: { leftElbow: 165, rightElbow: 165 },
  },
  {
    name: "Balance Training",
    category: "Neurological",
    jointKeys: ["leftHip", "rightHip"],
    direction: "flexion",
    focus: "lower",
    restThreshold: 175,
    workThreshold: 160,
    targetRange: [150, 175],
    targetReps: 8,
    instructions:
      "Hold a stable single-leg stance and minimize hip sway. Reps track sway cycles, not depth.",
    cues: {
      tooShallow: "Engage your standing leg a little more to steady your hips.",
      tooDeep: "Straighten up slightly — you're swaying too far to one side.",
      goodForm: "Stable stance — keep holding steady.",
    },
    optimalAngles: { leftHip: 168, rightHip: 168 },
  },
  {
    name: "Low Back Pain",
    category: "Spine",
    jointKeys: ["leftHip", "rightHip"],
    direction: "flexion",
    focus: "lower",
    restThreshold: 165,
    workThreshold: 140,
    targetRange: [100, 140],
    targetReps: 10,
    instructions:
      "Hinge slowly forward at the hips, keeping the back straight, then return to upright.",
    cues: {
      tooShallow: "Hinge forward a bit more from your hips, keeping your back flat.",
      tooDeep: "You're hinging further than recommended — rise up slightly.",
      goodForm: "Good hinge depth — return to standing slowly.",
    },
    optimalAngles: { leftHip: 120, rightHip: 120 },
  },
  {
    name: "Neck Rehabilitation",
    category: "Spine",
    jointKeys: [],
    direction: "flexion",
    focus: "full",
    restThreshold: 0,
    workThreshold: 0,
    targetRange: [0, 0],
    targetReps: 10,
    instructions:
      "Tracking for this exercise needs head/face landmarks that aren't computed yet.",
    cues: {
      tooShallow: "",
      tooDeep: "",
      goodForm: "",
    },
    optimalAngles: {},
    supported: false,
  },
  {
    name: "Squat Assessment",
    category: "Assessment",
    jointKeys: ["leftKnee", "rightKnee"],
    direction: "flexion",
    focus: "lower",
    restThreshold: 160,
    workThreshold: 120,
    targetRange: [70, 100],
    targetReps: 10,
    instructions: "Perform a full-depth squat for assessment.",
    cues: {
      tooShallow: "Squat deeper — bend your knees further toward a full squat.",
      tooDeep: "That's lower than the assessment range — rise up slightly.",
      goodForm: "Good full-depth squat — hold briefly, then stand back up.",
    },
    optimalAngles: { leftKnee: 85, rightKnee: 85, leftHip: 95, rightHip: 95 },
  },
  {
    name: "Lunge Assessment",
    category: "Assessment",
    jointKeys: ["leftKnee", "rightKnee"],
    direction: "flexion",
    focus: "lower",
    restThreshold: 160,
    workThreshold: 130,
    targetRange: [80, 110],
    targetReps: 10,
    instructions: "Step into a lunge, bending both knees, then return to standing.",
    cues: {
      tooShallow: "Step deeper into the lunge, bending both knees further.",
      tooDeep: "You've bent deeper than the target range — rise up slightly.",
      goodForm: "Good lunge depth — push back up to standing.",
    },
    optimalAngles: { leftKnee: 95, rightKnee: 95, leftHip: 110, rightHip: 110 },
  },
];
