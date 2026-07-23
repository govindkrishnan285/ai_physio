"use client";

import Link from "next/link";
import { useCallback } from "react";
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Dumbbell,
  Flame,
  Play,
  Repeat,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { useApiData } from "@/hooks/useApiData";
import { api } from "@/lib/api";
import { EmptyState } from "@/components/ui/states";

// Recovery stages, matching PatientProfile.recovery_stage on the backend.
const RECOVERY_STAGES = [
  { key: "acute", label: "Acute" },
  { key: "subacute", label: "Sub-Acute" },
  { key: "strengthening", label: "Strength" },
  { key: "return-to-sport", label: "Return" },
  { key: "maintenance", label: "Maintain" },
] as const;

function firstNameOf(fullName: string | undefined, email: string | undefined) {
  const n = (fullName ?? "").trim().split(/\s+/)[0];
  return n || email?.split("@")[0] || "there";
}

export default function DashboardPage() {
  const { user, patientProfile } = useAuth();

  const progress = useApiData(useCallback(() => api.getProgress(), []));
  const recent = useApiData(useCallback(() => api.getSessions({ limit: 4 }), []));
  const recs = useApiData(useCallback(() => api.getRecommendations(), []));
  const reports = useApiData(useCallback(() => api.getReports({ limit: 1 }), []));

  const p = progress.data;

  // Current accuracy: latest weekly figure, else the mean of recent sessions.
  const latestWeekly = p?.weekly_accuracy?.at(-1)?.accuracy;
  const recentMean =
    recent.data && recent.data.items.length > 0
      ? recent.data.items.reduce((a, s) => a + s.accuracy, 0) /
        recent.data.items.length
      : undefined;
  const accuracy = latestWeekly ?? recentMean;

  // Latest ROM + its trend direction, both from real data.
  const romTrend = p?.rom_trend ?? [];
  const latestRom = romTrend.at(-1)?.average_rom ?? null;
  const romDelta =
    romTrend.length >= 2
      ? (romTrend.at(-1)!.average_rom - romTrend[0].average_rom)
      : null;

  const stageIdx = Math.max(
    0,
    RECOVERY_STAGES.findIndex((s) => s.key === patientProfile?.recovery_stage)
  );

  const latestInsight = reports.data?.items?.[0]?.feedback?.[0];

  return (
    <div className="space-y-6 pb-4">
      {/* ---- Welcome hero ---- */}
      <section className="glass-card active-glow relative overflow-hidden rounded-[2rem] p-8 md:p-12">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-xl">
            <h1 className="text-3xl font-bold tracking-tight text-on-surface md:text-5xl">
              Welcome back, {firstNameOf(user?.full_name, user?.email)}
            </h1>
            <p className="mt-3 text-base text-on-surface-variant md:text-lg">
              {patientProfile?.injury_type
                ? `Tracking your ${patientProfile.injury_type} recovery — `
                : "Your rehabilitation is on track — "}
              ready for your next session?
            </p>
          </div>
          <Link
            href="/live-session"
            className="group flex shrink-0 items-center gap-3 rounded-full bg-primary px-8 py-5 font-bold text-on-primary transition-transform hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(79,219,200,0.4)]"
          >
            <Play size={22} className="fill-current" />
            <span className="text-lg">Start Live Session</span>
          </Link>
        </div>
      </section>

      {/* ---- Stat tiles ---- */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile
          label="Sessions Completed"
          value={p ? `${p.session_count}` : "—"}
          loading={progress.loading}
          accent
        />
        <StatTile
          label="Total Reps"
          value={p ? `${p.total_repetitions}` : "—"}
          loading={progress.loading}
          footer={
            romDelta !== null && romDelta > 0 ? (
              <span className="flex items-center gap-1 text-primary">
                <TrendingUp size={13} /> ROM +{romDelta.toFixed(0)}°
              </span>
            ) : undefined
          }
        />
        <StatTile
          label="Current Accuracy"
          value={accuracy !== undefined ? `${accuracy.toFixed(0)}%` : "—"}
          loading={progress.loading}
          accent
          bar={accuracy}
        />
        <StatTile
          label="Calories Burned"
          value={p ? `${p.total_calories.toFixed(0)}` : "—"}
          loading={progress.loading}
          footer={
            <span className="flex items-center gap-1 text-tertiary">
              <Flame size={13} className="fill-current" /> kcal total
            </span>
          }
        />
      </section>

      {/* ---- Main grid ---- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left: recovery overview + insight + journey */}
        <div className="space-y-4 lg:col-span-2">
          {/* Recovery overview */}
          <div className="glass-card relative overflow-hidden rounded-3xl p-8">
            <span className="absolute right-6 top-6 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary">
              {RECOVERY_STAGES[stageIdx].label} stage
            </span>
            <h2 className="mb-6 text-2xl font-semibold text-on-surface">
              Recovery Overview
            </h2>
            <div className="flex flex-col items-center gap-8 md:flex-row">
              <AccuracyRing value={accuracy} />
              <div className="flex-1 space-y-4">
                <MetricRow
                  label="Latest range of motion"
                  value={latestRom !== null ? `${latestRom.toFixed(0)}°` : "No data"}
                  fill={latestRom !== null ? Math.min(100, (latestRom / 140) * 100) : 0}
                />
                <MetricRow
                  label="Sessions logged"
                  value={p ? `${p.session_count}` : "—"}
                  fill={p ? Math.min(100, p.session_count * 8) : 0}
                  dim
                />
              </div>
            </div>
          </div>

          {/* Recent AI insight */}
          <div className="relative rounded-3xl border border-primary/20 bg-surface-container-highest p-8">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-primary/20 p-3 text-primary">
                <Sparkles size={22} />
              </div>
              <div>
                <h3 className="mb-2 text-lg font-bold text-on-surface">
                  Recent AI Insight
                </h3>
                {reports.loading ? (
                  <p className="text-on-surface-variant">Loading…</p>
                ) : latestInsight ? (
                  <p className="text-lg italic leading-relaxed text-on-surface">
                    “{latestInsight}”
                  </p>
                ) : (
                  <p className="text-on-surface-variant">
                    Complete a session and your latest AI coaching cue will
                    appear here.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Recovery journey timeline */}
          <div className="glass-card rounded-3xl p-8">
            <h3 className="mb-8 text-2xl font-semibold text-on-surface">
              Recovery Journey
            </h3>
            <div className="relative pb-4 pt-6">
              <div className="absolute left-0 top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-surface-variant" />
              <div
                className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_10px_rgba(79,219,200,0.5)] transition-all"
                style={{
                  width: `${(stageIdx / (RECOVERY_STAGES.length - 1)) * 100}%`,
                }}
              />
              <div className="relative flex justify-between">
                {RECOVERY_STAGES.map((s, i) => {
                  const done = i <= stageIdx;
                  const current = i === stageIdx;
                  return (
                    <div key={s.key} className="flex flex-col items-center">
                      <div
                        className={`z-10 mb-2 rounded-full border-4 border-background ${
                          current
                            ? "h-6 w-6 bg-primary active-glow"
                            : done
                              ? "h-4 w-4 bg-primary"
                              : "h-4 w-4 bg-surface-variant"
                        }`}
                      />
                      <span
                        className={`label-caps text-[10px] ${
                          done ? "text-primary" : "text-on-surface-variant"
                        } ${current ? "font-bold" : ""}`}
                      >
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right: recommended exercises */}
        <div className="lg:col-span-1">
          <div className="glass-card h-full rounded-3xl p-6">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-bold text-on-surface">Daily Lineup</h3>
              <Link
                href="/exercises"
                className="text-sm font-semibold text-primary hover:underline"
              >
                View all
              </Link>
            </div>

            {recs.loading ? (
              <p className="text-sm text-on-surface-variant">Loading…</p>
            ) : recs.data && recs.data.length > 0 ? (
              <div className="space-y-3">
                {recs.data.slice(0, 4).map((r) => (
                  <div
                    key={r.exercise_id}
                    className="group cursor-pointer rounded-2xl border border-outline-variant/20 bg-surface-container p-4 transition-all hover:border-primary/50"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Dumbbell size={18} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-on-surface">
                          {r.exercise_name}
                        </h4>
                        <p className="mt-0.5 line-clamp-2 text-xs text-on-surface-variant">
                          {r.reason}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No recommendations yet — complete a few sessions and the AI will suggest exercises." />
            )}

            {/* Recent sessions quick list */}
            <div className="mt-6 border-t border-outline-variant/20 pt-6">
              <p className="label-caps mb-3 text-[10px] text-on-surface-variant">
                Recent Sessions
              </p>
              {recent.loading ? (
                <p className="text-sm text-on-surface-variant">Loading…</p>
              ) : recent.data && recent.data.items.length > 0 ? (
                <div className="space-y-2">
                  {recent.data.items.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="flex items-center gap-2 text-on-surface">
                        <CheckCircle2 size={14} className="text-primary" />
                        {s.exercise}
                      </span>
                      <span
                        className={`font-semibold ${
                          s.accuracy >= 85
                            ? "text-primary"
                            : s.accuracy >= 65
                              ? "text-tertiary"
                              : "text-error"
                        }`}
                      >
                        {s.accuracy.toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant">
                  No sessions recorded yet.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  loading,
  accent,
  bar,
  footer,
}: {
  label: string;
  value: string;
  loading: boolean;
  accent?: boolean;
  bar?: number;
  footer?: React.ReactNode;
}) {
  return (
    <div
      className={`glass-card rounded-2xl p-6 ${
        accent ? "border-l-4 border-primary" : ""
      }`}
    >
      <p className="label-caps mb-2 text-[10px] text-on-surface-variant">
        {label}
      </p>
      <span
        className={`text-[32px] font-bold leading-none tracking-tight ${
          accent ? "text-primary" : "text-on-surface"
        }`}
      >
        {loading ? "…" : value}
      </span>
      {bar !== undefined && (
        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-primary/20">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.min(100, Math.max(0, bar))}%` }}
          />
        </div>
      )}
      {footer && <div className="mt-2 text-xs">{footer}</div>}
    </div>
  );
}

function MetricRow({
  label,
  value,
  fill,
  dim,
}: {
  label: string;
  value: string;
  fill: number;
  dim?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-on-surface">{label}</span>
        <span className="font-mono text-sm text-primary">{value}</span>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-surface-variant">
        <div
          className={`h-full rounded-full ${dim ? "bg-primary/40" : "bg-primary"}`}
          style={{ width: `${Math.min(100, Math.max(0, fill))}%` }}
        />
      </div>
    </div>
  );
}

function AccuracyRing({ value }: { value: number | undefined }) {
  const pct = value ?? 0;
  const r = 58;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg className="h-full w-full -rotate-90">
        <circle
          className="text-surface-variant"
          cx="64"
          cy="64"
          r={r}
          fill="transparent"
          stroke="currentColor"
          strokeWidth="8"
        />
        <circle
          className="text-primary transition-all"
          cx="64"
          cy="64"
          r={r}
          fill="transparent"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={value === undefined ? circ : offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-on-surface">
          {value === undefined ? "—" : `${pct.toFixed(0)}%`}
        </span>
        <span className="label-caps text-[10px] text-on-surface-variant">
          Accuracy
        </span>
      </div>
    </div>
  );
}
