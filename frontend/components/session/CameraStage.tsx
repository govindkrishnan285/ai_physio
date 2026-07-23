"use client";

import { useEffect, useMemo, useRef } from "react";
import Webcam from "react-webcam";
import {
  Activity,
  Camera,
  Circle,
  Pause,
  Play,
  RotateCcw,
  Loader2,
  AlertTriangle,
} from "lucide-react";

import { usePose } from "@/context/PoseContext";
import { drawSkeleton } from "@/lib/drawing";
import { MovementPhase } from "@/hooks/useLiveMetrics";
import CalibrationOverlay from "@/components/session/CalibrationOverlay";
import ReferenceMiniPlayer from "@/components/session/ReferenceMiniPlayer";

const PHASE_STYLE: Record<MovementPhase, string> = {
  Start: "bg-slate-700/70 text-slate-200",
  Descending: "bg-sky-600/70 text-white",
  Ascending: "bg-teal-600/70 text-white",
  Hold: "bg-amber-600/70 text-white",
  Completed: "bg-emerald-600/70 text-white",
};

export default function CameraStage({
  phase,
  reps,
  targetReps,
  correction,
  correctionTone,
}: {
  phase: MovementPhase;
  reps: number;
  targetReps: number;
  correction: string | null;
  correctionTone: "ok" | "warning" | "idle";
}) {
  const {
    webcamRef,
    running,
    sessionPhase,
    pose,
    startSession,
    pauseSession,
    resetSession,
    saving,
    selectedExercise,
    calibration,
    qualityThreshold,
    degraded,
    startAnyway,
    cameraDeviceId,
  } = usePose();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const calibrating = sessionPhase === "calibrating";
  const active = sessionPhase === "active";

  // Prefer a selected device (e.g. iPhone-as-webcam) at high resolution;
  // otherwise the front-facing camera. Higher resolution = cleaner landmarks.
  const videoConstraints = useMemo(
    () =>
      cameraDeviceId
        ? { deviceId: { exact: cameraDeviceId }, width: 1920, height: 1080 }
        : { facingMode: "user", width: 1920, height: 1080 },
    [cameraDeviceId]
  );

  useEffect(() => {
    if (!running || !pose.landmarks) return;
    const canvas = canvasRef.current;
    const video = webcamRef.current?.video;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const elW = video.clientWidth;
    const elH = video.clientHeight;
    canvas.width = elW;
    canvas.height = elH;
    ctx.clearRect(0, 0, elW, elH);

    // The feed is shown with object-contain (whole frame, letterboxed), so the
    // video occupies only a fitted rect inside the element. Draw the skeleton
    // into that same rect, or it drifts off the body into the black bars.
    const vW = video.videoWidth || 16;
    const vH = video.videoHeight || 9;
    const videoAspect = vW / vH;
    const elAspect = elW / elH;
    let dispW: number, dispH: number, offX: number, offY: number;
    if (elAspect > videoAspect) {
      // Pillarboxed: full height, bars left/right.
      dispH = elH;
      dispW = elH * videoAspect;
      offX = (elW - dispW) / 2;
      offY = 0;
    } else {
      // Letterboxed: full width, bars top/bottom.
      dispW = elW;
      dispH = elW / videoAspect;
      offX = 0;
      offY = (elH - dispH) / 2;
    }

    ctx.save();
    ctx.translate(offX, offY);
    drawSkeleton(ctx, pose.landmarks, dispW, dispH);
    ctx.restore();
  }, [pose.landmarks, running, webcamRef]);

  return (
    <div className="flex h-full w-full gap-3">
    <div
      className={`relative flex-1 overflow-hidden rounded-2xl border bg-black transition-colors ${
        active && degraded ? "border-amber-600" : "border-slate-800"
      }`}
    >
      {running ? (
        <>
          <Webcam
            ref={webcamRef}
            mirrored
            audio={false}
            videoConstraints={videoConstraints}
            screenshotFormat="image/jpeg"
            // object-contain shows the ENTIRE captured frame (letterboxed if the
            // stage isn't 16:9), rather than cropping it to fill.
            className="absolute inset-0 h-full w-full object-contain"
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full pointer-events-none"
          />
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-4">
          <Camera size={64} className="text-slate-700" />
          <div className="text-center">
            <h2 className="text-xl font-semibold text-white">Camera Offline</h2>
            <p className="mt-1 text-sm text-slate-400">
              Start the session — the camera will calibrate before tracking
            </p>
          </div>
          <button
            onClick={startSession}
            className="mt-2 flex items-center gap-2 rounded-xl bg-teal-700 px-6 py-3 text-sm font-medium hover:bg-teal-600"
          >
            <Play size={18} /> Start Session
          </button>
        </div>
      )}

      {/* Top-left: exercise + phase */}
      {running && (
        <div className="absolute left-4 top-4 flex items-center gap-3">
          <div className="rounded-xl border border-white/10 bg-slate-900/50 px-4 py-2.5 backdrop-blur-md">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Exercise</p>
            <p className="text-sm font-semibold text-white">{selectedExercise.name}</p>
          </div>
          {active && (
            <span
              className={`rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur-md ${PHASE_STYLE[phase]}`}
            >
              {phase}
            </span>
          )}
        </div>
      )}

      {/* Top-right: FPS / tracking / recording */}
      {running && (
        <div className="absolute right-4 top-4 flex items-center gap-2">
          <Chip>
            <Activity size={13} className="text-teal-400" />
            {pose.fps} FPS
          </Chip>
          <Chip>
            <span
              className={`h-1.5 w-1.5 rounded-full ${pose.isTracking ? "bg-teal-400" : "bg-rose-500"}`}
            />
            {pose.isTracking ? "Tracking" : "No Person"}
          </Chip>
          <Chip>
            <Circle
              size={9}
              className={
                active && !degraded
                  ? "fill-rose-500 text-rose-500 animate-pulse"
                  : "text-slate-500"
              }
            />
            {active && !degraded ? "REC" : calibrating ? "CAL" : "PAUSED"}
          </Chip>
        </div>
      )}

      {/* Calibration overlay */}
      {calibrating && (
        <CalibrationOverlay
          report={calibration}
          threshold={qualityThreshold}
          onStartAnyway={startAnyway}
        />
      )}

      {/* Degraded warning (active) */}
      {active && degraded && (
        <div className="absolute left-1/2 top-16 max-w-[70%] -translate-x-1/2 rounded-xl border border-amber-600 bg-amber-950/70 px-5 py-3 text-center backdrop-blur-md">
          <div className="flex items-center justify-center gap-2 text-amber-300">
            <AlertTriangle size={15} />
            <p className="text-sm font-semibold">Tracking paused — quality dropped</p>
          </div>
          <p className="mt-0.5 text-xs text-amber-100/90">
            {calibration?.instructions[0] ?? "Reposition until tracking quality recovers."}
          </p>
        </div>
      )}

      {/* Rep counter (active) */}
      {active && (
        <div className="absolute bottom-4 left-4 rounded-xl border border-white/10 bg-slate-900/50 px-5 py-3 backdrop-blur-md">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Reps</p>
          <p className="text-3xl font-bold leading-none text-white">
            {reps}
            <span className="ml-1 text-lg font-medium text-slate-400">/ {targetReps}</span>
          </p>
        </div>
      )}

      {/* Live correction ticker (active, not degraded) */}
      {active && !degraded && correction && (
        <div
          className={`absolute bottom-4 left-1/2 max-w-[55%] -translate-x-1/2 rounded-xl border px-5 py-3 text-center backdrop-blur-md ${
            correctionTone === "warning"
              ? "border-amber-700/60 bg-amber-950/40"
              : correctionTone === "ok"
                ? "border-teal-800/60 bg-teal-950/40"
                : "border-white/10 bg-slate-900/50"
          }`}
        >
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Live Correction</p>
          <p className="text-sm font-medium text-white">{correction}</p>
        </div>
      )}

      {/* Controls (active) */}
      {active && (
        <div className="absolute bottom-4 right-4 flex items-center gap-2">
          <ControlButton onClick={pauseSession} title="Pause">
            <Pause size={16} />
          </ControlButton>
          <ControlButton onClick={resetSession} title="Stop & Save" disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
          </ControlButton>
        </div>
      )}
    </div>

      {/* Side-by-side reference clip (renders only when one is trained) */}
      <ReferenceMiniPlayer />
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900/50 px-2.5 py-1.5 text-xs font-medium text-slate-200 backdrop-blur-md">
      {children}
    </span>
  );
}

function ControlButton({
  children,
  onClick,
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="rounded-lg border border-white/10 bg-slate-900/60 p-2.5 text-white backdrop-blur-md hover:bg-slate-800/80 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
