"use client";

import { useEffect, useRef, useState } from "react";
import { Film } from "lucide-react";

import { usePose } from "@/context/PoseContext";
import { api, ReferenceVideo } from "@/lib/api";

const SPEEDS = [0.5, 0.75, 1, 1.25];

/**
 * Side-by-side reference exercise clip, synchronized with the live session:
 *  - starts when the exercise becomes active, pauses when paused/degraded,
 *  - restarts from the top when a new session begins,
 *  - loops only the active-movement window detected during training,
 *  - supports playback-speed adjustment.
 * Renders nothing until a reference clip exists for the selected exercise.
 */
export default function ReferenceMiniPlayer() {
  const { backendExerciseId, selectedExercise, sessionPhase, degraded } = usePose();

  const [ref, setRef] = useState<ReferenceVideo | null>(null);
  const [speed, setSpeed] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const prevActiveRef = useRef(false);

  const activeNow = sessionPhase === "active" && !degraded;

  // Fetch the reference clip whenever the exercise changes.
  useEffect(() => {
    let alive = true;
    setRef(null);
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
      if (!prevActiveRef.current) v.currentTime = ref.start_sec ?? 0;
      v.play().catch(() => {});
    } else {
      v.pause();
    }
    prevActiveRef.current = activeNow;
  }, [activeNow, ref]);

  if (backendExerciseId == null || !ref) return null;

  const start = ref.start_sec ?? 0;
  const end = ref.end_sec;

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
          loop={end == null}
          onLoadedMetadata={() => {
            if (videoRef.current) videoRef.current.currentTime = start;
          }}
          onTimeUpdate={() => {
            const v = videoRef.current;
            if (!v) return;
            const stop = end ?? v.duration;
            if (v.currentTime >= stop || v.currentTime < start - 0.1) {
              v.currentTime = start;
            }
          }}
          className="absolute inset-0 h-full w-full object-contain"
        />
        {!activeNow && (
          <div className="absolute inset-x-0 bottom-0 bg-slate-950/70 px-3 py-1.5 text-center text-[11px] text-slate-300">
            {sessionPhase === "calibrating"
              ? "Ready — plays when tracking starts"
              : "Paused — mirror this movement"}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 border-t border-slate-800 px-3 py-2">
        <span className="mr-1 text-[11px] text-slate-500">Speed</span>
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
