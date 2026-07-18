"use client";

import { useCallback, useState } from "react";
import {
  CheckCircle,
  Clock,
  Download,
  Repeat,
  Target,
  Trash2,
  Gauge,
} from "lucide-react";

import { useApiData } from "@/hooks/useApiData";
import { api } from "@/lib/api";
import { bumpSessions } from "@/lib/sessionStore";
import { downloadReportsCsv } from "@/lib/exportCsv";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

const PAGE_SIZE = 10;

export default function ReportsPage() {
  const [page, setPage] = useState(0);
  const [deleting, setDeleting] = useState<number | null>(null);

  const reports = useApiData(
    useCallback(
      () => api.getReports({ limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
      [page]
    ),
    [page]
  );

  const data = reports.data;
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function handleDelete(id: number) {
    setDeleting(id);
    try {
      await api.deleteSession(id);
      bumpSessions(); // refresh this page + dashboard + progress
    } catch {
      // ignore; the row stays until next refetch
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          {total} session{total === 1 ? "" : "s"} on record
        </p>
        <button
          onClick={() => data && downloadReportsCsv(data.items)}
          disabled={!data || data.items.length === 0}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-700 rounded-xl px-4 py-2.5 text-sm font-medium"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      {reports.loading ? (
        <LoadingState label="Loading reports…" />
      ) : reports.error ? (
        <ErrorState message={reports.error} onRetry={reports.refetch} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState message="No sessions recorded yet. Complete a Live Session to generate a report." />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {data.items.map((r) => (
              <div
                key={r.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {r.exercise}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">{r.date}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(r.id)}
                    disabled={deleting === r.id}
                    className="text-slate-500 hover:text-rose-400 p-1 disabled:opacity-40"
                    aria-label="Delete session"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <Metric icon={<Clock size={15} />} label="Duration" value={`${r.duration_minutes} min`} />
                  <Metric icon={<Repeat size={15} />} label="Reps" value={`${r.repetitions}`} />
                  <Metric
                    icon={<Target size={15} />}
                    label="Avg ROM"
                    value={r.average_rom !== null ? `${r.average_rom.toFixed(0)}°` : "—"}
                  />
                  <Metric
                    icon={<Gauge size={15} />}
                    label="Accuracy"
                    value={`${r.accuracy.toFixed(0)}%`}
                  />
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">
                    AI Feedback
                  </p>
                  {r.feedback.length === 0 ? (
                    <p className="text-sm text-slate-500">No feedback logged.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {r.feedback.map((f, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm text-slate-300"
                        >
                          <CheckCircle
                            size={14}
                            className="text-teal-400 mt-0.5 shrink-0"
                          />
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-slate-400">
                Page {page + 1} of {pageCount}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-slate-800/60 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-slate-400">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-white font-semibold mt-1">{value}</p>
    </div>
  );
}
