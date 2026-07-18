import { JointAngles, Landmark } from "@/types/pose";

export type Point = Landmark;

export function calculateAngle(
  a: Point,
  b: Point,
  c: Point
): number {
  const radians =
    Math.atan2(
      c.y - b.y,
      c.x - b.x
    ) -
    Math.atan2(
      a.y - b.y,
      a.x - b.x
    );

  let angle =
    Math.abs(
      (radians * 180) / Math.PI
    );

  if (angle > 180) {
    angle = 360 - angle;
  }

  return Number(angle.toFixed(1));
}

export function calculateDistance(
  a: Point,
  b: Point
): number {
  return Math.sqrt(
    Math.pow(a.x - b.x, 2) +
      Math.pow(a.y - b.y, 2)
  );
}

// 3D angle at vertex b, using metric world landmarks. Because world landmarks
// are perspective-corrected (hip-centered meters), these angles stay accurate
// regardless of camera distance, tilt, or the patient's body proportions.
export function calculateAngle3D(a: Point, b: Point, c: Point): number {
  const ba = [a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)];
  const bc = [c.x - b.x, c.y - b.y, (c.z ?? 0) - (b.z ?? 0)];
  const dot = ba[0] * bc[0] + ba[1] * bc[1] + ba[2] * bc[2];
  const n1 = Math.hypot(ba[0], ba[1], ba[2]);
  const n2 = Math.hypot(bc[0], bc[1], bc[2]);
  if (n1 < 1e-6 || n2 < 1e-6) return 180;
  const cos = Math.max(-1, Math.min(1, dot / (n1 * n2)));
  return Number(((Math.acos(cos) * 180) / Math.PI).toFixed(1));
}

/*
MediaPipe Pose Indexes

11 Left Shoulder
12 Right Shoulder

13 Left Elbow
14 Right Elbow

15 Left Wrist
16 Right Wrist

23 Left Hip
24 Right Hip

25 Left Knee
26 Right Knee

27 Left Ankle
28 Right Ankle
*/

function computeJoints(
  lm: Landmark[],
  angle: (a: Point, b: Point, c: Point) => number
): JointAngles {
  return {
    leftElbow: angle(lm[11], lm[13], lm[15]),
    rightElbow: angle(lm[12], lm[14], lm[16]),
    leftShoulder: angle(lm[13], lm[11], lm[23]),
    rightShoulder: angle(lm[14], lm[12], lm[24]),
    leftHip: angle(lm[11], lm[23], lm[25]),
    rightHip: angle(lm[12], lm[24], lm[26]),
    leftKnee: angle(lm[23], lm[25], lm[27]),
    rightKnee: angle(lm[24], lm[26], lm[28]),
  };
}

// 2D angles from normalized image landmarks (fallback when world landmarks
// aren't available).
export function getJointAngles(
  landmarks: Landmark[] | null
): JointAngles | null {
  if (!landmarks || landmarks.length < 33) return null;
  return computeJoints(landmarks, calculateAngle);
}

// Perspective-robust angles from metric world landmarks — the accurate path.
export function getJointAnglesWorld(
  worldLandmarks: Landmark[] | null
): JointAngles | null {
  if (!worldLandmarks || worldLandmarks.length < 33) return null;
  return computeJoints(worldLandmarks, calculateAngle3D);
}