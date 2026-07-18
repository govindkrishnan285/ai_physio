"use client";

import Link from "next/link";
import { useCallback } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Activity,
  Calendar,
  Camera,
  Flame,
  Gauge,
  Repeat,
} from "lucide-react";

import { usePose } from "@/context/PoseContext";
import { useApiData } from "@/hooks/useApiData";
import { api } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

function formatDuration(totalSec: number) {
  const m = Math.round(totalSec / 60);
  return m > 0 ? `${m} min` : `${totalSec}s`;
}

export default function DashboardPage() {
  const { selectedExercise } = usePose();

  const progress = useApiData(useCallback(() => api.getProgress(), []));
  const recent = useApiData(useCallback(() => api.getSessions({ limit: 5 }), []));
  const library = useApiData(useCallback(() => api.listExercises(), []));

  const p = progress.data;
  const trainedCount = library.data?.filter((e) => e.has_profile).length ?? 0;
  const libraryTotal = library.data?.length ?? 0;

  return (
    <div className="space-y-8 pb-4">

      {/* ---- Hero ---- */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
        {/* layered background */}
        <div className="absolute inset-0 bg-gradient-to-br from-teal-900/70 via-slate-900 to-slate-950" />
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-teal-500/20 blur-3xl" />
        <ContourLines />

        <div className="relative flex flex-col justify-end gap-6 px-8 py-12 md:px-12 md:py-16 min-h-[320px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex w-fit items-center gap-2 rounded-full border border-teal-700/50 bg-teal-500/10 px-3 py-1 text-xs font-medium text-teal-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-400" />
              AI Pose Engine · Online
            </span>
            {libraryTotal > 0 && (
              <span className="flex w-fit items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs font-medium text-slate-300 backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                {trainedCount}/{libraryTotal} exercises trained
              </span>
            )}
          </div>

          <div className="max-w-2xl">
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl">
              Your recovery,
              <br />
              guided in real time.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-300 md:text-base">
              Camera-based movement tracking, live posture correction, and
              clinical progress — {selectedExercise.name} is queued and ready.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/live-session"
              className="flex items-center gap-2 rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-teal-500"
            >
              <Camera size={17} /> Start Live Session
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/exercises"
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-6 py-3 text-sm font-semibold text-slate-200 backdrop-blur transition hover:bg-slate-800"
            >
              Browse Exercises
            </Link>
          </div>
        </div>
      </section>

      {/* ---- Stat strip ---- */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat icon={<Calendar size={18} />} label="Sessions Logged" value={p ? `${p.session_count}` : "—"} loading={progress.loading} />
        <Stat icon={<Repeat size={18} />} label="Total Reps" value={p ? `${p.total_repetitions}` : "—"} loading={progress.loading} />
        <Stat icon={<Flame size={18} />} label="Calories Burned" value={p ? `${p.total_calories.toFixed(0)} kcal` : "—"} loading={progress.loading} />
        <Stat icon={<Gauge size={18} />} label="Avg Session" value={p ? formatDuration(p.average_duration_seconds) : "—"} loading={progress.loading} />
      </section>

      {/* ---- Numbered feature cards ---- */}
      <section>
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Ways to progress
        </p>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <FeatureCard
            n="01"
            title="Run a Live Session"
            body="Calibrate, then get real-time reps, joint angles, and AI posture correction."
            href="/live-session"
          />
          <FeatureCard
            n="02"
            title="Track Your Progress"
            body="Weekly accuracy, ROM trends, pain scores, and exercise frequency over time."
            href="/progress"
          />
          <FeatureCard
            n="03"
            title="Review Reports"
            body="Per-session summaries with AI feedback, exportable for your therapist."
            href="/reports"
          />
        </div>
      </section>

      {/* ---- Full-bleed CTA band ---- */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-800">
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900 to-teal-900/60" />
        <div className="absolute -left-16 bottom-0 h-72 w-72 rounded-full bg-teal-500/15 blur-3xl" />
        <div className="relative flex flex-col items-start justify-between gap-6 px-8 py-10 md:flex-row md:items-center md:px-12">
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold text-white md:text-3xl">
              Teach the AI your own protocol.
            </h2>
            <p className="mt-2 text-sm text-slate-300 md:text-base">
              Upload reference videos and the model learns the correct movement,
              then scores every rep against it.
            </p>
          </div>
          <Link
            href="/reference"
            className="flex shrink-0 items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/10"
          >
            Train a Model <ArrowUpRight size={16} />
          </Link>
        </div>
      </section>

      {/* ---- Recent sessions ---- */}
      <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 md:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Recent Sessions</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Straight from your rehabilitation record
            </p>
          </div>
          <Link
            href="/reports"
            className="flex items-center gap-1 text-sm font-medium text-teal-400 hover:text-teal-300"
          >
            View all reports <ArrowRight size={14} />
          </Link>
        </div>

        {recent.loading ? (
          <LoadingState />
        ) : recent.error ? (
          <ErrorState message={recent.error} onRetry={recent.refetch} />
        ) : !recent.data || recent.data.items.length === 0 ? (
          <EmptyState message="No sessions yet. Start a Live Session to record your first." />
        ) : (
          <div className="divide-y divide-slate-800">
            {recent.data.items.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-400">
                    <Activity size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{s.exercise}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{s.date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-8 text-sm">
                  <span className="text-slate-400">{s.repetitions} reps</span>
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
      </section>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="text-teal-400">{icon}</div>
      <p className="mt-4 text-sm text-slate-400">{label}</p>
      <h2 className="mt-1 text-2xl font-semibold text-white">
        {loading ? "…" : value}
      </h2>
    </div>
  );
}

function FeatureCard({
  n,
  title,
  body,
  href,
}: {
  n: string;
  title: string;
  body: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 p-7 transition hover:border-teal-800"
    >
      <span className="text-4xl font-bold text-slate-700 transition-colors group-hover:text-teal-700">
        {n}
      </span>
      <h3 className="mt-6 text-xl font-bold text-white">{title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">{body}</p>
      <span className="mt-5 flex items-center gap-1.5 text-sm font-medium text-teal-400">
        Open <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
      </span>
      {/* corner arc, echoing the reference cards */}
      <svg
        className="absolute bottom-0 right-0 h-16 w-16 text-slate-800 transition-colors group-hover:text-teal-800"
        viewBox="0 0 64 64"
        fill="none"
      >
        <path d="M64 0 A64 64 0 0 1 0 64" stroke="currentColor" strokeWidth="2" />
      </svg>
    </Link>
  );
}

function ContourLines() {
  // Abstract flowing lines — evokes movement/topography without a photo asset.
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12]"
      preserveAspectRatio="none"
      viewBox="0 0 1200 400"
      fill="none"
    >
      {[0, 40, 80, 120, 160, 200].map((o) => (
        <path
          key={o}
          d={`M0 ${300 - o} C 300 ${240 - o}, 500 ${360 - o}, 800 ${280 - o} S 1100 ${200 - o}, 1200 ${260 - o}`}
          stroke="#2dd4bf"
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}
