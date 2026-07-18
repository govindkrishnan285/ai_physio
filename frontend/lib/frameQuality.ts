// Samples the webcam frame to measure lighting quality without heavy per-pixel
// work: the video is drawn to a tiny offscreen canvas and luminance stats are
// computed from the downscaled image.

export interface FrameQuality {
  brightness: number; // 0..1 mean luminance
  contrast: number; // 0..1 normalized luminance spread
  backlight: number; // 0..1 how much brighter the border is than the centre
}

const SW = 48;
const SH = 27;

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

function ensureCanvas(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = SW;
    canvas.height = SH;
    ctx = canvas.getContext("2d", { willReadFrequently: true });
  }
  return ctx;
}

export function measureFrameQuality(
  video: HTMLVideoElement
): FrameQuality | null {
  const c = ensureCanvas();
  if (!c || video.readyState !== 4) return null;

  try {
    c.drawImage(video, 0, 0, SW, SH);
  } catch {
    return null;
  }

  const { data } = c.getImageData(0, 0, SW, SH);
  const n = SW * SH;

  let sum = 0;
  let sumSq = 0;
  let centerSum = 0;
  let centerN = 0;
  let borderSum = 0;
  let borderN = 0;

  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      const i = (y * SW + x) * 4;
      // Rec. 601 luma, normalized 0..1.
      const lum =
        (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      sum += lum;
      sumSq += lum * lum;

      const centralX = x > SW * 0.3 && x < SW * 0.7;
      const centralY = y > SH * 0.2 && y < SH * 0.85;
      if (centralX && centralY) {
        centerSum += lum;
        centerN++;
      } else if (x < SW * 0.15 || x > SW * 0.85 || y < SH * 0.1) {
        borderSum += lum;
        borderN++;
      }
    }
  }

  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  const contrast = Math.min(1, Math.sqrt(variance) * 3.2);

  const centerMean = centerN ? centerSum / centerN : mean;
  const borderMean = borderN ? borderSum / borderN : mean;
  const backlight = Math.min(1, Math.max(0, borderMean - centerMean) * 2.5);

  return { brightness: mean, contrast, backlight };
}
