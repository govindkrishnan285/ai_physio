export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface JointAngles {
  leftElbow: number;
  rightElbow: number;
  leftShoulder: number;
  rightShoulder: number;
  leftHip: number;
  rightHip: number;
  leftKnee: number;
  rightKnee: number;
}

export type JointAngleKey = keyof JointAngles;
