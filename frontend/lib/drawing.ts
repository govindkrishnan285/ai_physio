import { POSE_CONNECTIONS } from "./poseConnections";

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: any[],
  width: number,
  height: number
) {
  drawConnections(ctx, landmarks, width, height);
  drawLandmarks(ctx, landmarks, width, height);
}

function drawConnections(
  ctx: CanvasRenderingContext2D,
  landmarks: any[],
  width: number,
  height: number
) {
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 3;

  for (const [start, end] of POSE_CONNECTIONS) {
    const a = landmarks[start];
    const b = landmarks[end];

    if (!a || !b) continue;

    if (
      (a.visibility ?? 1) < 0.5 ||
      (b.visibility ?? 1) < 0.5
    ) {
      continue;
    }

    ctx.beginPath();

    ctx.moveTo(
      (1 - a.x) * width,
      a.y * height
    );

    ctx.lineTo(
      (1 - b.x) * width,
      b.y * height
    );

    ctx.stroke();
  }
}

function drawLandmarks(
  ctx: CanvasRenderingContext2D,
  landmarks: any[],
  width: number,
  height: number
) {
  for (const landmark of landmarks) {
    if ((landmark.visibility ?? 1) < 0.5) continue;

    ctx.beginPath();

    ctx.arc(
      (1 - landmark.x) * width,
      landmark.y * height,
      4,
      0,
      Math.PI * 2
    );

    ctx.fillStyle = "#e2e8f0";
    ctx.fill();
  }
}