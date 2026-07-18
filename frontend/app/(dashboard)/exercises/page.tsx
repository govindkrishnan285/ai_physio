"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, Cpu, Film } from "lucide-react";

import { usePose } from "@/context/PoseContext";
import { useApiData } from "@/hooks/useApiData";
import { api, BackendExercise } from "@/lib/api";
import { ExerciseConfig } from "@/lib/exerciseConfig";

export default function ExercisesPage() {
  const { exercises, selectedExercise, setSelectedExercise } = usePose();
  const router = useRouter();

  // Backend training status per exercise (trained profile + reference clip).
  const backend = useApiData(useCallback(() => api.listExercises(), []));
  const statusByName = new Map<string, BackendExercise>(
    (backend.data ?? []).map((e) => [e.name, e])
  );
  const backendUp = !backend.loading && !backend.error && !!backend.data;

  const categories = Array.from(new Set(exercises.map((e) => e.category)));

  function selectAndStart(exercise: ExerciseConfig) {
    setSelectedExercise(exercise);
    router.push("/live-session");
  }

  return (
    <div className="space-y-8">
      {categories.map((category) => (
        <div key={category}>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
            {category}
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {exercises
              .filter((e) => e.category === category)
              .map((exercise) => {
                const active = selectedExercise.name === exercise.name;
                const disabled = exercise.supported === false;
                const status = statusByName.get(exercise.name);

                return (
                  <div
                    key={exercise.name}
                    className={`flex flex-col justify-between rounded-2xl border bg-slate-900 p-5 ${
                      active ? "border-teal-700" : "border-slate-800"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-white">{exercise.name}</h3>
                        {active && <CheckCircle2 size={18} className="shrink-0 text-teal-400" />}
                      </div>

                      {/* Training / reference status badges */}
                      {backendUp && !disabled && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                              status?.has_profile
                                ? "border-teal-800 bg-teal-500/10 text-teal-300"
                                : "border-slate-700 bg-slate-800 text-slate-400"
                            }`}
                          >
                            <Cpu size={11} />
                            {status?.has_profile ? "Model trained" : "Not trained"}
                          </span>
                          {status?.has_reference_video && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-sky-800 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-300">
                              <Film size={11} /> Reference clip
                            </span>
                          )}
                        </div>
                      )}

                      <p className="mt-2 text-sm text-slate-500">
                        {exercise.instructions}
                      </p>

                      {disabled && (
                        <p className="mt-3 text-xs text-amber-500">
                          Tracking coming soon
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => selectAndStart(exercise)}
                      disabled={disabled}
                      className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 py-2.5 text-sm font-medium transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-slate-800"
                    >
                      Select &amp; Start
                      <ChevronRight size={16} />
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
