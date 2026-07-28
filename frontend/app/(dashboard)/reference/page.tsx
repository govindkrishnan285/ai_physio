"use client";

import { useEffect, useRef, useState } from "react";

import RequireAuth from "@/components/auth/RequireAuth";
import {
  BrainCircuit,
  CheckCircle2,
  Cpu,
  Film,
  Loader2,
  Plus,
  Trash2,
  Video,
  Upload,
  AlertTriangle,
  ServerCrash,
} from "lucide-react";

import { api, BackendExercise, TrainResult } from "@/lib/api";

type TrainMode = "upload" | "youtube";

function ReferenceTrainingPageInner() {
  const [exercises, setExercises] = useState<BackendExercise[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<TrainMode>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [urls, setUrls] = useState<string[]>([""]);
  const [trainTf, setTrainTf] = useState(false);
  const [training, setTraining] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [result, setResult] = useState<TrainResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backendUp, setBackendUp] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await api.health();
        const list = await api.listExercises();
        if (!active) return;
        setBackendUp(true);
        setExercises(list);
        setSelectedId(list[0]?.id ?? null);
      } catch {
        if (active) setBackendUp(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const selected = exercises.find((e) => e.id === selectedId) ?? null;

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const vids = Array.from(incoming).filter(
      (f) => f.type.startsWith("video/") || /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(f.name)
    );
    if (vids.length === 0) {
      setError("Those files aren't videos. Use mp4, mov, avi, mkv, webm or m4v.");
      return;
    }
    setError(null);
    setFiles((prev) => [...prev, ...vids]);
  }

  async function handleTrain() {
    if (selectedId === null) return;

    setTraining(true);
    setError(null);
    setResult(null);
    setProgress(0);
    setStage("Uploading…");
    try {
      let accepted;
      if (mode === "upload") {
        if (files.length === 0) {
          setError("Add at least one video file.");
          return;
        }
        accepted = await api.trainFromUpload(selectedId, files, trainTf);
      } else {
        const cleaned = urls.map((u) => u.trim()).filter(Boolean);
        if (cleaned.length === 0) {
          setError("Add at least one reference video URL.");
          return;
        }
        setStage("Downloading video…");
        accepted = await api.trainFromYoutube(selectedId, cleaned, trainTf);
      }

      // Training runs in the background; follow its progress.
      const res = await api.waitForTrainingJob(accepted.job_id, (job) => {
        setProgress(job.progress);
        setStage(job.message);
      });

      setResult(res);
      setFiles([]);
      setExercises((prev) =>
        prev.map((e) =>
          e.id === selectedId
            ? { ...e, has_profile: true, has_reference_video: true }
            : e
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Training failed.");
    } finally {
      setTraining(false);
    }
  }

  if (backendUp === false) {
    return (
      <div className="max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
        <ServerCrash className="mx-auto text-amber-400 mb-4" size={40} />
        <h2 className="text-lg font-semibold text-white mb-2">
          Backend not reachable
        </h2>
        <p className="text-slate-400 text-sm">
          The AI training service isn&apos;t running. Start the FastAPI backend
          (see <code className="text-teal-400">backend/README.md</code>) and set{" "}
          <code className="text-teal-400">NEXT_PUBLIC_API_URL</code> if it&apos;s
          not on <code className="text-teal-400">localhost:8000</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-teal-700 p-2.5 rounded-lg">
            <BrainCircuit size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">
              Teach an Exercise from Reference Videos
            </h2>
            <p className="text-sm text-slate-400">
              The model extracts pose landmarks, builds a movement template, and
              learns the correct execution.
            </p>
          </div>
        </div>

        <p className="text-xs text-amber-500/90 mt-3 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Downloading YouTube videos may conflict with YouTube&apos;s Terms of
          Service and reference clips are often copyrighted. Use for private
          research/clinical prototyping.
        </p>
      </div>

      {/* Exercise picker */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <label className="text-sm text-slate-400">Exercise to train</label>
        <select
          value={selectedId ?? ""}
          onChange={(e) => {
            setSelectedId(Number(e.target.value));
            setResult(null);
            setError(null);
          }}
          className="mt-2 w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:border-teal-700"
        >
          {exercises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} ({e.category})
              {e.has_profile ? " ✓ trained" : ""}
              {e.has_reference_video ? " · clip" : ""}
            </option>
          ))}
        </select>

        {selected && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge trained={selected.has_profile} kind="model" />
              {selected.has_reference_video && (
                <StatusBadge trained kind="clip" />
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2">{selected.instructions}</p>
          </>
        )}
      </div>

      {/* Whole-library status */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Library Status</h3>
          <span className="text-xs text-slate-400">
            {exercises.filter((e) => e.has_profile).length} / {exercises.length} trained
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {exercises.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between rounded-lg bg-slate-800/60 border border-slate-800 px-3 py-2"
            >
              <span className="text-sm text-slate-200 truncate">{e.name}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                {e.has_reference_video && (
                  <Film size={13} className="text-sky-400" />
                )}
                <span
                  className={`flex items-center gap-1 text-[11px] font-medium ${
                    e.has_profile ? "text-teal-400" : "text-slate-500"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      e.has_profile ? "bg-teal-500" : "bg-slate-600"
                    }`}
                  />
                  {e.has_profile ? "Trained" : "Untrained"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Source: upload (preferred) or YouTube */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setMode("upload");
              setError(null);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              mode === "upload"
                ? "bg-teal-700 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Upload videos
          </button>
          <button
            onClick={() => {
              setMode("youtube");
              setError(null);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              mode === "youtube"
                ? "bg-teal-700 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            YouTube URL
          </button>
        </div>

        {mode === "upload" ? (
          <div className="space-y-3">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
                dragging
                  ? "border-teal-600 bg-teal-500/10"
                  : "border-slate-700 bg-slate-800/40 hover:border-slate-600"
              }`}
            >
              <Upload size={26} className="text-teal-400" />
              <p className="text-sm font-medium text-white">
                Drop exercise videos here, or click to browse
              </p>
              <p className="text-xs text-slate-500">
                mp4 · mov · avi · mkv · webm — your own recordings, so the
                reference clip can ship with the app
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                multiple
                hidden
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            {files.length > 0 && (
              <div className="space-y-2">
                {files.map((f, i) => (
                  <div
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-800/60 px-3 py-2"
                  >
                    <Film size={15} className="shrink-0 text-teal-400" />
                    <span className="flex-1 truncate text-sm text-slate-200">
                      {f.name}
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {(f.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                    <button
                      onClick={() =>
                        setFiles((prev) => prev.filter((_, j) => j !== i))
                      }
                      className="shrink-0 p-1 text-slate-500 hover:text-rose-400"
                      aria-label={`Remove ${f.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="flex items-start gap-2 text-xs text-amber-500/90">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              Downloaded clips stay copyrighted, so they can&apos;t be shipped as
              the side-by-side reference. Uploading your own footage is preferred.
            </p>
            {urls.map((url, i) => (
          <div key={i} className="flex items-center gap-2">
            <Video size={18} className="text-rose-400 shrink-0" />
            <input
              value={url}
              onChange={(e) =>
                setUrls((prev) =>
                  prev.map((u, j) => (j === i ? e.target.value : u))
                )
              }
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-teal-700 placeholder:text-slate-600"
            />
            {urls.length > 1 && (
              <button
                onClick={() =>
                  setUrls((prev) => prev.filter((_, j) => j !== i))
                }
                className="text-slate-500 hover:text-rose-400 p-1"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}

            <button
              onClick={() => setUrls((prev) => [...prev, ""])}
              className="flex items-center gap-2 text-sm text-teal-400 hover:text-teal-300"
            >
              <Plus size={16} /> Add another video
            </button>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-400 pt-2">
          <input
            type="checkbox"
            checked={trainTf}
            onChange={(e) => setTrainTf(e.target.checked)}
            className="accent-teal-600"
          />
          Also train the TensorFlow autoencoder (needs ENABLE_TF and enough reps)
        </label>
      </div>

      {error && (
        <div className="bg-rose-950/40 border border-rose-900 rounded-xl p-4 text-sm text-rose-300 flex items-center gap-2">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {result && (
        <div className="bg-teal-500/10 border border-teal-800 rounded-xl p-5">
          <div className="flex items-center gap-2 text-teal-300 font-medium mb-2">
            <CheckCircle2 size={18} /> Training complete
          </div>
          <p className="text-sm text-slate-300">{result.message}</p>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <Stat label="Reps learned" value={`${result.n_reps}`} />
            <Stat label="Videos used" value={`${result.n_videos}`} />
            <Stat
              label="Features"
              value={`${result.feature_names.length}`}
            />
          </div>
        </div>
      )}

      {/* Live training progress */}
      {training && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-slate-300">
              <Loader2 size={15} className="animate-spin text-teal-400" />
              {stage || "Working…"}
            </span>
            <span className="font-semibold text-white">{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-2 rounded-full bg-teal-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Training runs on the server — you can keep this tab open; pose
            analysis is the slow part.
          </p>
        </div>
      )}

      <button
        onClick={handleTrain}
        disabled={training || selectedId === null}
        className="w-full bg-teal-700 hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2"
      >
        {training ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Training… {progress}%
          </>
        ) : (
          <>
            <BrainCircuit size={18} />
            Learn this exercise
          </>
        )}
      </button>

    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-800/60 rounded-lg p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-xl font-semibold text-white mt-0.5">{value}</p>
    </div>
  );
}

function StatusBadge({ trained, kind }: { trained: boolean; kind: "model" | "clip" }) {
  if (kind === "clip") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-sky-800 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-300">
        <Film size={11} /> Reference clip
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        trained
          ? "border-teal-800 bg-teal-500/10 text-teal-300"
          : "border-slate-700 bg-slate-800 text-slate-400"
      }`}
    >
      <Cpu size={11} />
      {trained ? "Model trained" : "Not trained"}
    </span>
  );
}

// Training rebuilds the shared reference profile, so it is therapist/admin only
// — matching the backend gate. Patients never see this in the nav; this guard
// also blocks direct navigation to /reference.
export default function ReferenceTrainingPage() {
  return (
    <RequireAuth roles={["therapist", "admin"]}>
      <ReferenceTrainingPageInner />
    </RequireAuth>
  );
}
