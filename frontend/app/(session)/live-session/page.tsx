"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Brain,
  ChevronDown,
  Cpu,
  Flame,
  Gauge,
  Play,
  Repeat,
  Square,
  Target,
  Timer,
  Move,
  ScanLine,
  Scale,
  AlertTriangle,
  CheckCircle,
  Video,
} from "lucide-react";

import { usePose } from "@/context/PoseContext";
import { useCameras } from "@/hooks/useCameras";
import { useLiveMetrics } from "@/hooks/useLiveMetrics";
import { useRepFormReview } from "@/hooks/useRepFormReview";
import { useLiveCue } from "@/hooks/useLiveCue";
import { getFeedback } from "@/lib/feedbackEngine";
import { SEVERITY_STYLE } from "@/lib/liveMetrics";
import CameraStage from "@/components/session/CameraStage";

function fmt(totalSec: number) {
  const m = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const s = (totalSec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function LiveSessionPage() {
  const {
    exercises,
    selectedExercise,
    setSelectedExercise,
    running,
    sessionPhase,
    startSession,
    pauseSession,
    resetSession,
    pose,
    angles,
    repCounter,
    elapsedSec,
    saving,
    calibration,
    degraded,
    serverAvailable,
    serverProfileReady,
    serverFeedback,
    cameraDeviceId,
    setCameraDeviceId,
  } = usePose();

  const cameras = useCameras();

  const metrics = useLiveMetrics({
    angles,
    exercise: selectedExercise,
    running,
    pose,
    repCounter,
    elapsedSec,
    serverFeedback,
  });

  // Per-rep form review (graded at the peak of each rep) replaces the old
  // per-frame mistake table, which jittered and mis-scored mid-movement.
  const { lastRep } = useRepFormReview({
    angles,
    exercise: selectedExercise,
    repCounter,
    running,
  });

  const feedback = getFeedback(selectedExercise, repCounter, pose, running);

  // Real-time coaching cue for the on-camera ticker: one calm, phase-aware line
  // (symmetry / tempo / depth). Detailed correction stays in the post-rep
  // review, so this never turns into a mid-movement data dump.
  const liveCue = useLiveCue({
    angles,
    exercise: selectedExercise,
    phase: metrics.phase,
    stability: metrics.stability,
    repCounter,
    running,
    isTracking: pose.isTracking,
  });
  const correctionTone =
    liveCue.tone === "success"
      ? ("ok" as const)
      : liveCue.tone === "warning"
        ? ("warning" as const)
        : ("idle" as const);

  // Prefer trained-model cues when available; else the rule-based feedback.
  const feedbackItems =
    serverProfileReady && serverFeedback
      ? serverFeedback.feedback.map((c) => ({ text: c.text, severity: c.severity }))
      : feedback.items.map((i) => ({
          text: i.text,
          severity: i.success ? "ok" : "warning",
        }));

  const confidencePct = Math.round(pose.confidence * 100);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
      {/* ---- Top bar ---- */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 px-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            <ArrowLeft size={15} /> Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-teal-700 p-1.5">
              <ScanLine size={16} />
            </div>
            <span className="text-sm font-semibold">Live Session</span>
          </div>

          {/* Exercise selector */}
          <div className="relative">
            <select
              value={selectedExercise.name}
              onChange={(e) => {
                const ex = exercises.find((x) => x.name === e.target.value);
                if (ex) setSelectedExercise(ex);
              }}
              disabled={running}
              className="appearance-none rounded-lg border border-slate-800 bg-slate-900 py-1.5 pl-3 pr-8 text-sm text-white outline-none focus:border-teal-700 disabled:opacity-60"
            >
              {exercises.map((ex) => (
                <option key={ex.name} value={ex.name}>
                  {ex.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={15}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"
            />
          </div>

          {/* Camera source selector (e.g. iPhone-as-webcam) */}
          {cameras.length > 0 && (
            <div className="relative hidden lg:block">
              <select
                value={cameraDeviceId ?? ""}
                onChange={(e) => setCameraDeviceId(e.target.value || undefined)}
                title="Camera source"
                className="max-w-[190px] appearance-none truncate rounded-lg border border-slate-800 bg-slate-900 py-1.5 pl-8 pr-8 text-sm text-white outline-none focus:border-teal-700"
              >
                <option value="">Default camera</option>
                {cameras.map((c) => (
                  <option key={c.deviceId} value={c.deviceId}>
                    {c.label}
                  </option>
                ))}
              </select>
              <Video
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-teal-400"
              />
              <ChevronDown
                size={15}
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5">
            <Timer size={15} className="text-teal-400" />
            <span className="font-mono text-sm tabular-nums">{fmt(elapsedSec)}</span>
          </div>
          {running && calibration && (
            <span
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                calibration.qualityScore >= 75
                  ? "bg-emerald-500/15 text-emerald-300"
                  : calibration.qualityScore >= 55
                    ? "bg-amber-500/15 text-amber-300"
                    : "bg-rose-500/15 text-rose-300"
              }`}
            >
              Quality {calibration.qualityScore}%
            </span>
          )}
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              degraded ? "bg-amber-500/15 text-amber-300" : "bg-slate-800 text-slate-200"
            }`}
          >
            {sessionPhase === "calibrating"
              ? "Calibrating"
              : degraded
                ? "Paused"
                : metrics.phase}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <TrainedBadge available={serverAvailable} ready={serverProfileReady} />
          {sessionPhase === "idle" && (
            <button
              onClick={startSession}
              disabled={selectedExercise.supported === false}
              className="flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play size={15} /> Start Session
            </button>
          )}
          {sessionPhase === "calibrating" && (
            <button
              onClick={pauseSession}
              className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium hover:bg-slate-700"
            >
              <Square size={15} /> Cancel
            </button>
          )}
          {sessionPhase === "active" && (
            <button
              onClick={resetSession}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium hover:bg-rose-600 disabled:opacity-60"
            >
              <Square size={15} /> {saving ? "Saving…" : "End & Save"}
            </button>
          )}
        </div>
      </header>

      {/* ---- Main: camera + metrics ---- */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 xl:grid-cols-[63%_1fr]">
        {/* Camera */}
        <div className="min-h-0">
          <CameraStage
            phase={metrics.phase}
            reps={repCounter.reps}
            targetReps={metrics.targetReps}
            correction={liveCue.text}
            correctionTone={correctionTone}
          />
        </div>

        {/* Metrics column */}
        <div className="flex min-h-0 flex-col gap-3">
          {/* KPI tiles */}
          <div className="grid grid-cols-4 gap-3">
            <Kpi icon={<Repeat size={16} />} label="Reps" value={`${repCounter.reps}/${metrics.targetReps}`} />
            <Kpi icon={<Target size={16} />} label="Completion" value={`${metrics.completionPct}%`} />
            <Kpi
              icon={<Move size={16} />}
              label="ROM"
              value={`${metrics.currentRom}°`}
              sub={`Target ${metrics.targetRom}°`}
            />
            <Kpi icon={<Flame size={16} />} label="Calories" value={`${metrics.calories}`} />
          </div>

          {/* Score meters */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Meter icon={<Gauge size={14} />} label="Movement Quality" value={metrics.movementQuality} />
              <Meter icon={<Cpu size={14} />} label="AI Confidence" value={confidencePct} />
              <Meter icon={<ScanLine size={14} />} label="Stability" value={metrics.stability} />
              <Meter icon={<Scale size={14} />} label="Balance" value={metrics.balance} />
              <Meter icon={<CheckCircle size={14} />} label="Accuracy" value={metrics.accuracy} />
              <Meter
                icon={<Target size={14} />}
                label="In-Range"
                value={
                  repCounter.lastRepInRange === null ? 0 : repCounter.lastRepInRange ? 100 : 0
                }
              />
            </div>
          </div>

          {/* Joint angles */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <Move size={14} /> Joint Angles
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {metrics.jointReadings.map((r) => {
                const style = r.severity ? SEVERITY_STYLE[r.severity] : null;
                return (
                  <div key={r.key} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${style ? style.dot : "bg-slate-600"}`}
                      />
                      <span className="text-slate-400">{r.label}</span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className={`font-semibold ${style ? style.text : "text-slate-200"}`}>
                        {angles ? `${r.current.toFixed(0)}°` : "—"}
                      </span>
                      <span className="text-xs text-slate-500">
                        {r.target !== null ? `(${r.target}°)` : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Feedback + mistakes */}
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
            {/* AI feedback */}
            <div className="flex min-h-0 flex-col rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <Brain size={14} className="text-teal-400" /> AI Feedback
              </h3>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {feedbackItems.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    {running
                      ? "Analyzing your movement…"
                      : "Start a session to receive live feedback."}
                  </p>
                ) : (
                  feedbackItems.map((f, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2 rounded-lg border p-2.5 text-sm ${
                        f.severity === "ok"
                          ? "border-teal-800 bg-teal-500/10"
                          : f.severity === "major"
                            ? "border-rose-900 bg-rose-500/10"
                            : "border-amber-800 bg-amber-500/10"
                      }`}
                    >
                      {f.severity === "ok" ? (
                        <CheckCircle size={15} className="mt-0.5 shrink-0 text-teal-400" />
                      ) : (
                        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" />
                      )}
                      <span className="text-slate-200">{f.text}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Last-rep form review — graded at the peak, stable between reps */}
            <div className="flex min-h-0 flex-col rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <h3 className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400">
                <span className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-400" /> Rep Form Review
                </span>
                {running && repCounter.phase === "working" && (
                  <span className="flex items-center gap-1.5 text-[10px] font-medium normal-case text-teal-400">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-400" />
                    Tracking rep…
                  </span>
                )}
                {lastRep && (
                  <span className="font-mono text-[10px] normal-case text-slate-500">
                    Rep {lastRep.repNumber}
                  </span>
                )}
              </h3>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {!running ? (
                  <p className="text-sm text-slate-500">No active session.</p>
                ) : !lastRep ? (
                  <p className="text-sm text-slate-500">
                    Complete a rep to see your form breakdown.
                  </p>
                ) : lastRep.mistakes.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-800 bg-emerald-500/10 p-2.5 text-sm text-emerald-300">
                    <CheckCircle size={15} /> Clean rep — every joint within range.
                  </div>
                ) : (
                  lastRep.mistakes.map((m) => {
                    const style = SEVERITY_STYLE[m.severity];
                    return (
                      <div
                        key={m.key}
                        className={`rounded-lg border p-2.5 ${style.border} ${style.bg}`}
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-sm font-semibold text-white">{m.label}</span>
                          <span className={`flex items-center gap-1 text-xs font-medium ${style.text}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                            {style.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">
                          At peak <span className="text-slate-200">{m.current}°</span> · Target{" "}
                          <span className="text-slate-200">{m.optimal}°</span> · Δ{" "}
                          <span className={style.text}>
                            {m.diff > 0 ? "+" : ""}
                            {m.diff}°
                          </span>
                        </p>
                        <p className="mt-1 text-sm text-slate-200">{m.correction}</p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
      <div className="flex items-center gap-1.5 text-teal-400">{icon}</div>
      <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-xl font-bold text-white">{value}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

function Meter({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  const color =
    value >= 80 ? "bg-emerald-500" : value >= 55 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-slate-400">
          {icon}
          {label}
        </span>
        <span className="font-semibold text-white">{value}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-800">
        <div
          className={`h-1.5 rounded-full transition-all ${color}`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

function TrainedBadge({ available, ready }: { available: boolean; ready: boolean }) {
  if (!available) return null;
  return (
    <span
      className={`hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs md:flex ${
        ready
          ? "border-teal-800 bg-teal-500/10 text-teal-300"
          : "border-slate-700 bg-slate-800 text-slate-400"
      }`}
    >
      <Cpu size={13} />
      {ready ? "Model trained" : "Model untrained"}
    </span>
  );
}
