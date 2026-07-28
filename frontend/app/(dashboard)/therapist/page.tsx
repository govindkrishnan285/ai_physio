"use client";

import Link from "next/link";
import { useCallback } from "react";
import { Users, ChevronRight, Activity } from "lucide-react";

import RequireAuth from "@/components/auth/RequireAuth";
import { useApiData } from "@/hooks/useApiData";
import { api } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

function accuracyClass(a: number | null) {
  if (a === null) return "text-slate-500";
  return a >= 85 ? "text-emerald-400" : a >= 65 ? "text-amber-400" : "text-rose-400";
}

function TherapistDashboardInner() {
  const roster = useApiData(useCallback(() => api.getMyPatients(), []));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-500/10 text-teal-400">
          <Users size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">My Patients</h1>
          <p className="text-sm text-slate-400">
            Patients assigned to you — open one to review their progress.
          </p>
        </div>
      </div>

      {roster.loading ? (
        <LoadingState label="Loading your patients…" />
      ) : roster.error ? (
        <ErrorState message={roster.error} onRetry={roster.refetch} />
      ) : !roster.data || roster.data.length === 0 ? (
        <EmptyState message="No patients are assigned to you yet. An administrator assigns patients to therapists." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {roster.data.map((p) => (
            <Link
              key={p.patient_profile_id}
              href={`/therapist/patients/${p.patient_profile_id}`}
              className="group rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-teal-800"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold text-white">
                    {p.name}
                  </h3>
                  <p className="truncate text-xs text-slate-500">{p.email}</p>
                </div>
                <ChevronRight
                  size={18}
                  className="text-slate-600 transition-transform group-hover:translate-x-1 group-hover:text-teal-400"
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {p.injury_type && (
                  <span className="rounded-full bg-slate-800 px-2.5 py-1 text-slate-300">
                    {p.injury_type}
                  </span>
                )}
                <span className="rounded-full border border-teal-800/60 bg-teal-500/10 px-2.5 py-1 capitalize text-teal-300">
                  {p.recovery_stage}
                </span>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3 text-sm">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <Activity size={14} /> {p.session_count} sessions
                </span>
                <span className={accuracyClass(p.avg_accuracy)}>
                  {p.avg_accuracy !== null ? `${p.avg_accuracy}% avg` : "no data"}
                </span>
              </div>
              {p.last_session_date && (
                <p className="mt-2 text-xs text-slate-600">
                  Last session {p.last_session_date}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TherapistDashboard() {
  return (
    <RequireAuth roles={["therapist", "admin"]}>
      <TherapistDashboardInner />
    </RequireAuth>
  );
}
