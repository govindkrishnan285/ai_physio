"use client";

import { useCallback, useState } from "react";
import { AlertTriangle, Database, Info, Loader2, Trash2 } from "lucide-react";

import { useApiData } from "@/hooks/useApiData";
import { api } from "@/lib/api";
import { bumpSessions } from "@/lib/sessionStore";

export default function SettingsPage() {
  const sessions = useApiData(
    useCallback(() => api.getSessions({ limit: 100 }), [])
  );
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);

  const total = sessions.data?.total ?? 0;

  async function handleClear() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    if (!sessions.data) return;

    setClearing(true);
    try {
      // Delete each session (backend cascades joint/feedback rows).
      await Promise.all(sessions.data.items.map((s) => api.deleteSession(s.id)));
      bumpSessions();
    } catch {
      // ignore; a refetch will reflect what actually deleted
    } finally {
      setClearing(false);
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-1">
          <Database size={18} className="text-teal-400" />
          <h2 className="text-lg font-semibold text-white">Session Data</h2>
        </div>
        <p className="text-slate-500 text-sm mb-5">
          All rehabilitation data is stored in PostgreSQL through the backend —
          the single source of truth. Nothing is kept in this browser.
        </p>

        <div className="flex items-center justify-between bg-slate-800/60 border border-slate-800 rounded-xl px-4 py-3">
          <div>
            <p className="text-white text-sm font-medium">
              {sessions.loading ? "…" : total} session
              {total === 1 ? "" : "s"} stored
            </p>
            <p className="text-slate-500 text-xs mt-0.5">
              Clearing permanently deletes every session and its joint/feedback
              records from the database.
            </p>
          </div>

          <button
            onClick={handleClear}
            onBlur={() => setConfirming(false)}
            disabled={total === 0 || clearing}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${
              confirming
                ? "bg-rose-700 hover:bg-rose-600"
                : "bg-slate-800 hover:bg-slate-700 border border-slate-700"
            }`}
          >
            {clearing ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Clearing…
              </>
            ) : confirming ? (
              <>
                <AlertTriangle size={16} /> Confirm Delete All
              </>
            ) : (
              <>
                <Trash2 size={16} /> Clear All
              </>
            )}
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-start gap-3">
          <Info size={18} className="text-teal-400 mt-0.5 shrink-0" />
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">
              About this tool
            </h2>
            <p className="text-slate-500 text-sm">
              AI Physio uses on-device pose estimation for real-time feedback and
              a server-side DTW/TensorFlow engine for movement scoring. It is a
              movement-tracking aid, not a diagnostic or medical device, and does
              not replace guidance from a licensed physiotherapist.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
