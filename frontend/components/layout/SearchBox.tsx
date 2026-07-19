"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Dumbbell, Loader2, Search, X } from "lucide-react";

import { usePose } from "@/context/PoseContext";
import { api, SessionSummary } from "@/lib/api";
import { ExerciseConfig } from "@/lib/exerciseConfig";

const DEBOUNCE_MS = 300;
const MAX_EXERCISES = 4;
const MAX_SESSIONS = 5;

/**
 * Global search over the exercise library (local config) and recorded sessions
 * (PostgreSQL, partial match on exercise name). Selecting an exercise makes it
 * the active one; selecting a session jumps to Reports.
 */
export default function SearchBox() {
  const router = useRouter();
  const { exercises, setSelectedExercise } = usePose();

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const trimmed = query.trim();

  // Exercise matches come from the local library — instant, no request.
  const matchedExercises = useMemo<ExerciseConfig[]>(() => {
    if (!trimmed) return [];
    const q = trimmed.toLowerCase();
    return exercises
      .filter(
        (e) =>
          e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q)
      )
      .slice(0, MAX_EXERCISES);
  }, [trimmed, exercises]);

  // Session matches are debounced against the backend.
  useEffect(() => {
    if (!trimmed) {
      setSessions([]);
      setError(false);
      return;
    }
    let alive = true;
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const res = await api.getSessions({ search: trimmed, limit: MAX_SESSIONS });
        if (alive) {
          setSessions(res.items);
          setError(false);
        }
      } catch {
        if (alive) {
          setSessions([]);
          setError(true);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [trimmed]);

  // Close on outside click / Escape.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function pickExercise(ex: ExerciseConfig) {
    setSelectedExercise(ex);
    setOpen(false);
    setQuery("");
    router.push("/exercises");
  }

  function pickSession() {
    setOpen(false);
    setQuery("");
    router.push("/reports");
  }

  const hasResults = matchedExercises.length > 0 || sessions.length > 0;
  const showPanel = open && trimmed.length > 0;

  return (
    <div ref={containerRef} className="relative hidden lg:block">
      <div className="flex w-80 items-center rounded-lg border border-slate-800 bg-slate-800/60 px-4 py-2">
        <Search className="shrink-0 text-slate-500" size={16} />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search sessions or exercises..."
          suppressHydrationWarning
          className="ml-3 w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
            className="shrink-0 text-slate-500 hover:text-slate-300"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {showPanel && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-xl">
          {matchedExercises.length > 0 && (
            <div className="p-2">
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Exercises
              </p>
              {matchedExercises.map((ex) => (
                <button
                  key={ex.name}
                  onClick={() => pickExercise(ex)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-800"
                >
                  <Dumbbell size={15} className="shrink-0 text-teal-400" />
                  <span className="flex-1 truncate text-sm text-slate-200">
                    {ex.name}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {ex.category}
                  </span>
                </button>
              ))}
            </div>
          )}

          {sessions.length > 0 && (
            <div className="border-t border-slate-800 p-2">
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Sessions
              </p>
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={pickSession}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-800"
                >
                  <Activity size={15} className="shrink-0 text-sky-400" />
                  <span className="flex-1 truncate text-sm text-slate-200">
                    {s.exercise}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {s.date} · {s.repetitions} reps
                  </span>
                </button>
              ))}
            </div>
          )}

          {!hasResults && (
            <div className="px-4 py-6 text-center">
              {loading ? (
                <span className="flex items-center justify-center gap-2 text-sm text-slate-400">
                  <Loader2 size={14} className="animate-spin" /> Searching…
                </span>
              ) : error ? (
                <span className="text-sm text-slate-400">
                  Backend unreachable — session search unavailable.
                </span>
              ) : (
                <span className="text-sm text-slate-400">
                  No matches for &ldquo;{trimmed}&rdquo;
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
