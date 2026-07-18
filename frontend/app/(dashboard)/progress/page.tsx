"use client";

import { useCallback } from "react";
import { Flame, Repeat, Timer, CalendarDays } from "lucide-react";

import { useApiData } from "@/hooks/useApiData";
import { api } from "@/lib/api";
import BarTrendChart from "@/components/dashboard/BarTrendChart";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

const CATEGORY_BAR_HUE = "#0d9488";

function formatDuration(totalSec: number) {
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function ProgressPage() {
  const { data, loading, error, refetch } = useApiData(
    useCallback(() => api.getProgress(), [])
  );

  if (loading) return <LoadingState label="Loading progress…" />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data || data.session_count === 0)
    return (
      <EmptyState message="No session data yet. Complete a few Live Sessions and your trends will appear here." />
    );

  const maxFreq = Math.max(...data.exercise_frequency.map((e) => e.count), 1);

  return (
    <div className="space-y-6">
      {/* Headline tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Tile icon={<CalendarDays size={20} />} label="Sessions" value={`${data.session_count}`} />
        <Tile icon={<Repeat size={20} />} label="Total Reps" value={`${data.total_repetitions}`} />
        <Tile icon={<Flame size={20} />} label="Calories" value={`${data.total_calories.toFixed(0)} kcal`} />
        <Tile icon={<Timer size={20} />} label="Avg Duration" value={formatDuration(data.average_duration_seconds)} />
      </div>

      <Card title="Weekly Accuracy" subtitle="Average form accuracy per ISO week">
        <BarTrendChart
          points={data.weekly_accuracy.map((w) => ({ label: w.week.split("-W")[1] ?? w.week, value: w.accuracy }))}
          unit="%"
          maxValue={100}
        />
      </Card>

      <Card title="Monthly Improvement" subtitle="Average accuracy trend month over month">
        <BarTrendChart
          points={data.monthly_improvement.map((m) => ({ label: m.month.slice(2), value: m.accuracy }))}
          unit="%"
          maxValue={100}
        />
      </Card>

      <Card title="Range of Motion Trend" subtitle="Average ROM per session day">
        <BarTrendChart
          points={data.rom_trend.map((r, i) => ({ label: `${i + 1}`, value: r.average_rom }))}
          unit="°"
        />
      </Card>

      {data.pain_trend.length > 0 && (
        <Card title="Pain Score Trend" subtitle="Patient-reported pain (0–10) per session day">
          <BarTrendChart
            points={data.pain_trend.map((p, i) => ({ label: `${i + 1}`, value: p.pain_score }))}
            maxValue={10}
          />
        </Card>
      )}

      <Card title="Exercise Frequency" subtitle="How often each program has been performed">
        {data.exercise_frequency.length === 0 ? (
          <p className="text-slate-500 text-sm py-4 text-center">No data yet.</p>
        ) : (
          <div className="space-y-3">
            {data.exercise_frequency.map((e) => (
              <div key={e.exercise} className="flex items-center gap-4">
                <span className="w-40 shrink-0 text-sm text-slate-400 truncate">
                  {e.exercise}
                </span>
                <div className="flex-1 bg-slate-800 rounded-full h-2.5">
                  <div
                    className="h-2.5 rounded-full"
                    style={{
                      width: `${(e.count / maxFreq) * 100}%`,
                      backgroundColor: CATEGORY_BAR_HUE,
                    }}
                  />
                </div>
                <span className="w-6 text-right text-sm text-slate-300">
                  {e.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="text-teal-400">{icon}</div>
      <p className="text-slate-400 mt-4 text-sm">{label}</p>
      <h2 className="text-2xl font-semibold mt-1 text-white">{value}</h2>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-white mb-1">{title}</h2>
      <p className="text-slate-500 text-sm mb-5">{subtitle}</p>
      {children}
    </div>
  );
}
