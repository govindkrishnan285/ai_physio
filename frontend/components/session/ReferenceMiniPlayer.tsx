"use client";

import { useEffect, useRef, useState } from "react";
import { Film, RotateCcw, Play } from "lucide-react";

import { usePose } from "@/context/PoseContext";
import { api, ReferenceVideo } from "@/lib/api";

const SPEEDS = [0.5, 0.75, 1, 1.25];

/**
 * Side-by-side reference exercise clip, synchronized with the live session.
 *
 * It plays the correct movement once, then PAUSES on a "Your turn" prompt
 * instead of looping continuously — so the patient has time to watch, copy the
 * movement, and do their reps at their own pace. They press Replay to watch it
 * again whenever they want.
 */
export default function ReferenceMiniPlayer() {
  const { backendExerciseId, selectedExercise, sessionPhase, degraded } = usePose();

  const [ref, setRef] = useState<ReferenceVideo | null>(null);
  const [speed, setSpeed] = useState(1);
  // True once a play-through finishes: the clip is paused, waiting for the user
  // to perform their reps and replay when ready.
  const [awaitingReplay, setAwaitingReplay] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const prevActiveRef = useRef(false);

  const activeNow = sessionPhase === "active" && !degraded;

  // Fetch the reference clip whenever the exercise changes.
  useEffect(() => {
    let alive = true;
    setRef(null);
    setAwaitingReplay(false);
    if (backendExerciseId == null) return;
    api.getReferenceVideo(backendExerciseId).then((r) => {
      if (alive) setRef(r);
    });
    return () => {
      alive = false;
    };
  }, [backendExerciseId]);

  // Apply playback speed.
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed, ref]);

  // Play/pause + restart-on-new-session sync.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !ref) return;
    if (activeNow) {
      // A freshly-started session plays the reference from the top.
      if (!prevActiveRef.current) {
        v.currentTime = ref.start_sec ?? 0;
        setAwaitingReplay(false);
      }
      // While the user is on their own practice pause, keep it paused.
      if (!awaitingReplay) v.play().catch(() => {});
    } else {
      v.pause();
    }
    prevActiveRef.current = activeNow;
  }, [activeNow, ref, awaitingReplay]);

  function replay() {
    const v = videoRef.current;
    if (!v || !ref) return;
    v.currentTime = ref.start_sec ?? 0;
    setAwaitingReplay(false);
    v.play().catch(() => {});
  }

  if (backendExerciseId == null || !ref) return null;

  const start = ref.start_sec ?? 0;
  const end = ref.end_sec;
  const showYourTurn = activeNow && awaitingReplay;

  return (
    <div className="flex w-[300px] shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2.5">
        <Film size={15} className="text-teal-400" />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">
          Reference
        </span>
        <span className="ml-auto truncate text-xs text-slate-500">
          {selectedExercise.name}
        </span>
      </div>

      <div className="relative flex-1 bg-black">
        <video
          ref={videoRef}
          src={ref.url}
          muted
          playsInline
          preload="auto"
          onLoadedMetadata={() => {
            if (videoRef.current) videoRef.current.currentTime = start;
          }}
          onTimeUpdate={() => {
            const v = videoRef.current;
            if (!v) return;
            const stop = end ?? v.duration;
            // Guard the lower bound (seek jitter), and at the end of one
            // play-through, PAUSE for the practice gap instead of looping.
            if (v.currentTime < start - 0.1) {
              v.currentTime = start;
            } else if (v.currentTime >= stop) {
              v.currentTime = stop;
              v.pause();
              setAwaitingReplay(true);
            }
          }}
          className="absolute inset-0 h-full w-full object-contain"
        />

        {/* Your-turn practice gap: paused, waiting for the user to replay. */}
        {showYourTurn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/75 px-4 text-center backdrop-blur-sm">
            <p className="text-sm font-semibold text-white">Your turn</p>
            <p className="text-[11px] text-slate-300">
              Copy the movement and do your reps at your own pace.
            </p>
            <button
              onClick={replay}
              className="mt-1 flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-500"
            >
              <RotateCcw size={14} /> Replay reference
            </button>
          </div>
        )}

        {!activeNow && (
          <div className="absolute inset-x-0 bottom-0 bg-slate-950/70 px-3 py-1.5 text-center text-[11px] text-slate-300">
            {sessionPhase === "calibrating"
              ? "Ready — plays when tracking starts"
              : "Paused — mirror this movement"}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 border-t border-slate-800 px-3 py-2">
        {/* Manual replay is always available, so the user controls the pace. */}
        <button
          onClick={replay}
          disabled={!activeNow}
          title="Replay the reference movement"
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
        >
          <Play size={12} /> Replay
        </button>
        <span className="ml-auto mr-1 text-[11px] text-slate-500">Speed</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${
              speed === s
                ? "bg-teal-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}
