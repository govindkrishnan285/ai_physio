"use client";

import { useEffect, useRef, useState } from "react";

import { api, AnalyzeRepResponse, BackendExercise } from "@/lib/api";
import { Landmark } from "@/types/pose";

const MIN_FRAMES_PER_REP = 5;

export interface LiveServerScoring {
  /** Backend reachable at all. */
  serverAvailable: boolean;
  /** Selected exercise has a trained reference profile on the backend. */
  profileReady: boolean;
  /** Most recent per-rep analysis returned by the DTW/learned engine. */
  serverFeedback: AnalyzeRepResponse | null;
  /** True while a completed rep is being scored by the backend. */
  analyzing: boolean;
  /** Backend id of the currently selected exercise (null if unmapped/offline). */
  backendExerciseId: number | null;
  /** DTW analysis per rep, keyed by rep index, for session persistence. */
  serverRepRecords: React.RefObject<Map<number, AnalyzeRepResponse>>;
}

interface Params {
  landmarks: Landmark[] | null;
  fps: number;
  reps: number;
  phase: "rest" | "working";
  running: boolean;
  exerciseName: string;
}

/**
 * Bridges the client pose loop to the FastAPI scoring engine.
 *
 * Landmark frames are buffered while the rep counter is in its "working" phase;
 * when a rep completes (rep count increments) the buffer is POSTed to
 * /analyze/rep and the returned trained-model analysis is exposed. Everything
 * degrades silently to client-side feedback if the backend is down or the
 * exercise has no trained profile yet.
 */
export function useLiveServerScoring({
  landmarks,
  fps,
  reps,
  phase,
  running,
  exerciseName,
}: Params): LiveServerScoring {
  const [serverAvailable, setServerAvailable] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [serverFeedback, setServerFeedback] = useState<AnalyzeRepResponse | null>(
    null
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [backendExerciseId, setBackendExerciseId] = useState<number | null>(null);

  const exercisesRef = useRef<Map<string, BackendExercise>>(new Map());
  const bufferRef = useRef<number[][][]>([]);
  const prevRepsRef = useRef(reps);
  const serverRepRecords = useRef<Map<number, AnalyzeRepResponse>>(new Map());

  // Latest-value refs so the flush effect can depend only on `reps`.
  const fpsRef = useRef(fps);
  fpsRef.current = fps;
  const availRef = useRef(serverAvailable);
  availRef.current = serverAvailable;
  const nameRef = useRef(exerciseName);
  nameRef.current = exerciseName;

  // Discover backend exercises once (maps frontend exercise name -> backend id).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const list = await api.listExercises();
        if (!active) return;
        exercisesRef.current = new Map(list.map((e) => [e.name, e]));
        setServerAvailable(true);
        const match = exercisesRef.current.get(exerciseName);
        setProfileReady(!!match?.has_profile);
        setBackendExerciseId(match?.id ?? null);
      } catch {
        if (active) setServerAvailable(false);
      }
    })();
    return () => {
      active = false;
    };
    // Intentionally run once; exerciseName is re-read below when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset per-exercise state when the selected exercise changes.
  useEffect(() => {
    const match = exercisesRef.current.get(exerciseName);
    setProfileReady(!!match?.has_profile);
    setBackendExerciseId(match?.id ?? null);
    setServerFeedback(null);
    bufferRef.current = [];
    serverRepRecords.current.clear();
  }, [exerciseName]);

  // Clear buffered/stale feedback whenever a fresh session starts.
  useEffect(() => {
    if (running) {
      setServerFeedback(null);
      serverRepRecords.current.clear();
    }
    bufferRef.current = [];
  }, [running]);

  // Buffer frames during the working phase of a rep.
  useEffect(() => {
    if (!running || phase !== "working" || !landmarks) return;
    bufferRef.current.push(
      landmarks.map((l) => [l.x, l.y, l.z ?? 0, l.visibility ?? 1])
    );
  }, [landmarks, running, phase]);

  // On rep completion, flush the buffer to the backend for scoring.
  useEffect(() => {
    if (reps <= prevRepsRef.current) {
      // Reset baseline on session reset (reps went back down).
      prevRepsRef.current = reps;
      return;
    }
    prevRepsRef.current = reps;

    // Index of the rep that just completed.
    const repIndex = reps - 1;

    const frames = bufferRef.current;
    bufferRef.current = [];

    const match = exercisesRef.current.get(nameRef.current);
    if (!availRef.current || !match?.has_profile || frames.length < MIN_FRAMES_PER_REP) {
      return;
    }

    setAnalyzing(true);
    api
      .analyzeRep(match.id, frames, Math.max(1, Math.round(fpsRef.current)))
      .then((res) => {
        setServerFeedback(res);
        // Keyed by rep index so async responses persist to the right rep.
        serverRepRecords.current.set(repIndex, res);
      })
      .catch(() => {
        // Network/scoring error: keep client-side feedback, don't surface noise.
      })
      .finally(() => setAnalyzing(false));
  }, [reps]);

  return {
    serverAvailable,
    profileReady,
    serverFeedback,
    analyzing,
    backendExerciseId,
    serverRepRecords,
  };
}
