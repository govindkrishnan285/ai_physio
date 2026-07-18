"use client";

import { AlertTriangle, Inbox, Loader2, RotateCcw } from "lucide-react";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-slate-400">
      <Loader2 size={18} className="animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <AlertTriangle size={28} className="text-amber-400" />
      <p className="text-sm text-slate-300 max-w-md">{message}</p>
      <p className="text-xs text-slate-500">
        Is the backend running on{" "}
        <code className="text-teal-400">localhost:8000</code>?
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 flex items-center gap-2 text-sm text-teal-400 hover:text-teal-300"
        >
          <RotateCcw size={14} /> Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-slate-400">
      <Inbox size={28} className="text-slate-600" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
