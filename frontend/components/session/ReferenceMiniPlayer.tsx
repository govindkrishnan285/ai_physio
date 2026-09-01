"use client";

import { useEffect, useRef, useState } from "react";
import { Film, Pause, Play, RotateCcw } from "lucide-react";

import { usePose } from "@/context/PoseContext";
import { api, ReferenceVideo } from "@/lib/api";

const SPEEDS = [0.5, 0.75, 1, 1.25];

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Side-by-side reference exercise clip.
 *
 * The clip is controlled entirely by the user — it plays and pauses on their
 * command and loops the movement so they can watch and copy it at their own
 * pace. It is deliberately NOT tied to the live session's tracking quality:
 * previously it paused whenever pose quality dipped, which meant it stopped the
 * moment you actually moved. Scoring is a separate concern — the model still
 * ranks each rep against this reference regardless of what the clip is doing.
 */
export default function ReferenceMiniPlayer() {
  const { backendExerciseId, selectedExercise } = usePose();

  const [ref, setRef] = useState<ReferenceVideo | null>(null);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(true); // user's will; autoplays muted
  const [pos, setPos] = useState(0); // seconds into the trained window
  const [winDur, setWinDur] = useState(0); // length of the trained window
  const videoRef = useRef<HTMLVideoElement>(null);

  // The trained movement window bounds, resolving a null end to the clip end.
  function windowBounds() {
    const v = videoRef.current;
    const s = ref?.start_sec ?? 0;
    const e = ref?.end_sec ?? (v?.duration ?? 0);
    return { s, e };
  }

  // Seek to an offset (seconds) inside the trained window.
  function seekTo(offset: number) {
    const v = videoRef.current;
    if (!v) return;
    const { s, e } = windowBounds();
    const clamped = Math.max(0, Math.min(offset, Math.max(0, e - s)));
    v.currentTime = s + clamped;
    setPos(clamped);
  }

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

  // Play / pause purely on the user's toggle — never on session state.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !ref) return;
    if (playing) v.play().catch(() => {});
    else v.pause();
  }, [playing, ref]);

  function restart() {
    const v = videoRef.current;
    if (!v || !ref) return;
    v.currentTime = ref.start_sec ?? 0;
    setPlaying(true);
    v.play().catch(() => {});
  }

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
          autoPlay
          playsInline
          preload="auto"
          onLoadedMetadata={() => {
            const v = videoRef.current;
            if (!v) return;
            v.currentTime = start;
            setWinDur(Math.max(0, (end ?? v.duration) - start));
          }}
          onTimeUpdate={() => {
            const v = videoRef.current;
            if (!v) return;
            const stop = end ?? v.duration;
            // Loop the movement window continuously while playing.
            if (v.currentTime >= stop || v.currentTime < start - 0.1) {
              v.currentTime = start;
            }
            setPos(Math.max(0, v.currentTime - start));
          }}
          onClick={() => setPlaying((p) => !p)}
          className="absolute inset-0 h-full w-full cursor-pointer object-contain"
        />
        {!playing && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/40">
            <div className="rounded-full bg-slate-900/80 p-3">
              <Play size={22} className="text-white" />
            </div>
          </div>
        )}
      </div>

      {/* Scrub bar — drag to move to any point in the movement. */}
      <div className="flex items-center gap-2 border-t border-slate-800 px-3 pt-2">
        <span className="w-8 shrink-0 text-right font-mono text-[10px] text-slate-400">
          {fmt(pos)}
        </span>
        <input
          type="range"
          min={0}
          max={winDur || 0}
          step={0.05}
          value={Math.min(pos, winDur || 0)}
          onChange={(e) => seekTo(Number(e.target.value))}
          aria-label="Seek reference video"
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-slate-700 accent-teal-500"
        />
        <span className="w-8 shrink-0 font-mono text-[10px] text-slate-500">
          {fmt(winDur)}
        </span>
      </div>

      <div className="flex items-center gap-1 px-3 pb-2 pt-1.5">
        {/* Play / pause is the user's control — independent of the session. */}
        <button
          onClick={() => setPlaying((p) => !p)}
          title={playing ? "Pause reference" : "Play reference"}
          className="flex items-center gap-1 rounded bg-teal-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-teal-500"
        >
          {playing ? <Pause size={12} /> : <Play size={12} />}
          {playing ? "Pause" : "Play"}
        </button>
        <button
          onClick={restart}
          title="Restart from the beginning"
          className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-slate-300 transition hover:bg-slate-800"
        >
          <RotateCcw size={12} /> Restart
        </button>
        <span className="ml-auto mr-1 text-[11px] text-slate-500">Speed</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={`rounded px-1.5 py-0.5 text-[11px] font-medium transition ${
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
