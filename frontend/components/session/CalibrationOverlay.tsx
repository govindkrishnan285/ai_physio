"use client";

import { CheckCircle2, Loader2, ScanLine, XCircle } from "lucide-react";

import { CalibrationReport } from "@/lib/calibration";

export default function CalibrationOverlay({
  report,
  threshold,
  onStartAnyway,
}: {
  report: CalibrationReport | null;
  threshold: number;
  onStartAnyway: () => void;
}) {
  const score = report?.qualityScore ?? 0;
  const ready = report?.ready ?? false;
  const ring =
    score >= threshold ? "#10b981" : score >= threshold - 20 ? "#f59e0b" : "#f43f5e";

  const topInstructions = report?.instructions.slice(0, 3) ?? [];

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm">
      <div className="w-[min(90%,560px)] rounded-2xl border border-white/10 bg-slate-900/80 p-6 backdrop-blur-md">
        <div className="mb-4 flex items-center gap-4">
          {/* Quality ring */}
          <div className="relative h-20 w-20 shrink-0">
            <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1e293b" strokeWidth="3" />
              <circle
                cx="18"
                cy="18"
                r="15.9"
                fill="none"
                stroke={ring}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${score} 100`}
                className="transition-all duration-300"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold text-white">{score}</span>
              <span className="text-[9px] text-slate-400">/ 100</span>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <ScanLine size={16} className="text-teal-400" />
              <h2 className="text-base font-semibold text-white">
                Calibrating Camera
              </h2>
            </div>
            <p className="mt-0.5 text-sm text-slate-400">
              {ready
                ? "Scene looks good — starting your session…"
                : `Pose quality must reach ${threshold}% before analysis begins.`}
            </p>
          </div>
        </div>

        {/* Primary corrective instructions */}
        {!ready && topInstructions.length > 0 && (
          <div className="mb-4 space-y-1.5">
            {topInstructions.map((t, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg border border-amber-800 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-600 text-[10px] font-bold text-white">
                  {i + 1}
                </span>
                {t}
              </div>
            ))}
          </div>
        )}

        {/* Checklist */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {report?.checks.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-xs">
              {c.pass ? (
                <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />
              ) : (
                <XCircle
                  size={14}
                  className={`shrink-0 ${c.severity === "critical" ? "text-rose-400" : "text-amber-400"}`}
                />
              )}
              <span className={c.pass ? "text-slate-300" : "text-slate-400"}>
                {c.label}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-5 flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs text-slate-400">
            {ready ? (
              <>
                <Loader2 size={13} className="animate-spin text-emerald-400" />
                Hold steady…
              </>
            ) : (
              "Adjust until all critical checks pass"
            )}
          </span>
          <button
            onClick={onStartAnyway}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700"
          >
            Skip &amp; start anyway
          </button>
        </div>
      </div>
    </div>
  );
}
