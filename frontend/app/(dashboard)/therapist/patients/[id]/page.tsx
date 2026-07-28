"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback } from "react";
import { ArrowLeft, Activity, Gauge, Repeat, TrendingUp } from "lucide-react";

import RequireAuth from "@/components/auth/RequireAuth";
import { useApiData } from "@/hooks/useApiData";
import { api } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

function PatientDetailInner({ id }: { id: string }) {
  const progress = useApiData(useCallback(() => api.getProgress(id), [id]));
  const sessions = useApiData(
    useCallback(() => api.getSessions({ patientId: id, limit: 20 }), [id])
  );

  const p = progress.data;
  const latestRom = p?.rom_trend?.at(-1)?.average_rom ?? null;
  const latestAcc = p?.weekly_accuracy?.at(-1)?.accuracy ?? null;

  return (
    <div className="space-y-6">
      <Link
        href="/therapist"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-teal-400"
      >
        <ArrowLeft size={15} /> Back to patients
      </Link>

      {progress.loading ? (
        <LoadingState label="Loading patient progress…" />
      ) : progress.error ? (
        // 403 here means the patient isn't assigned to this therapist.
        <ErrorState message={progress.error} onRetry={progress.refetch} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat icon={<Activity size={18} />} label="Sessions" value={p ? `${p.session_count}` : "—"} />
            <Stat icon={<Repeat size={18} />} label="Total Reps" value={p ? `${p.total_repetitions}` : "—"} />
            <Stat icon={<Gauge size={18} />} label="Latest Accuracy" value={latestAcc !== null ? `${latestAcc.toFixed(0)}%` : "—"} accent />
            <Stat icon={<TrendingUp size={18} />} label="Latest ROM" value={latestRom !== null ? `${latestRom.toFixed(0)}°` : "—"} />
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-lg font-bold text-white">Session History</h2>
            {sessions.loading ? (
              <LoadingState />
            ) : sessions.error ? (
              <ErrorState message={sessions.error} onRetry={sessions.refetch} />
            ) : !sessions.data || sessions.data.items.length === 0 ? (
              <EmptyState message="This patient hasn't recorded any sessions yet." />
            ) : (
              <div className="divide-y divide-slate-800">
                {sessions.data.items.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-3 first:pt-0">
                    <div>
                      <p className="text-sm font-semibold text-white">{s.exercise}</p>
                      <p className="text-xs text-slate-500">{s.date}</p>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <span className="text-slate-400">{s.repetitions} reps</span>
                      {s.average_rom !== null && (
                        <span className="text-slate-400">{s.average_rom.toFixed(0)}° ROM</span>
                      )}
                      <span
                        className={`font-semibold ${
                          s.accuracy >= 85
                            ? "text-emerald-400"
                            : s.accuracy >= 65
                              ? "text-amber-400"
                              : "text-rose-400"
                        }`}
                      >
                        {s.accuracy.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="text-teal-400">{icon}</div>
      <p className="mt-3 text-xs text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? "text-teal-300" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <RequireAuth roles={["therapist", "admin"]}>
      <PatientDetailInner id={params.id} />
    </RequireAuth>
  );
}
