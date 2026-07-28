"use client";

import { useCallback, useState } from "react";
import { ShieldCheck, Users, Stethoscope, AlertCircle, Activity } from "lucide-react";

import RequireAuth from "@/components/auth/RequireAuth";
import { useApiData } from "@/hooks/useApiData";
import { api, TherapistOption, UserAdminItem } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

const ROLE_BADGE: Record<string, string> = {
  patient: "bg-sky-500/10 text-sky-300 border-sky-800/60",
  therapist: "bg-teal-500/10 text-teal-300 border-teal-800/60",
  admin: "bg-amber-500/10 text-amber-300 border-amber-800/60",
};

function AdminDashboardInner() {
  const overview = useApiData(useCallback(() => api.getAdminOverview(), []));
  const users = useApiData(useCallback(() => api.getAdminUsers(), []));
  const therapists = useApiData(useCallback(() => api.getAdminTherapists(), []));

  const [saving, setSaving] = useState<string | null>(null);
  const [rows, setRows] = useState<UserAdminItem[] | null>(null);
  const list = rows ?? users.data ?? null;

  async function assign(patientProfileId: string, therapistId: string | null) {
    setSaving(patientProfileId);
    try {
      const updated = await api.assignTherapist(patientProfileId, therapistId);
      // Reflect the change locally without a full refetch.
      setRows(
        (list ?? []).map((u) =>
          u.patient_profile_id === patientProfileId
            ? { ...u, therapist_id: updated.therapist_id }
            : u
        )
      );
      overview.refetch();
      therapists.refetch();
    } catch {
      users.refetch();
    } finally {
      setSaving(null);
    }
  }

  const o = overview.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300">
          <ShieldCheck size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Administrator</h1>
          <p className="text-sm text-slate-400">
            Manage users and assign patients to therapists.
          </p>
        </div>
      </div>

      {/* Overview */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <OverviewTile icon={<Users size={18} />} label="Patients" value={o?.patients} />
        <OverviewTile icon={<Stethoscope size={18} />} label="Therapists" value={o?.therapists} />
        <OverviewTile icon={<AlertCircle size={18} />} label="Unassigned" value={o?.unassigned_patients} warn={(o?.unassigned_patients ?? 0) > 0} />
        <OverviewTile icon={<Activity size={18} />} label="Sessions" value={o?.total_sessions} />
      </div>

      {/* Users + assignment */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-lg font-bold text-white">Users</h2>
        {users.loading ? (
          <LoadingState label="Loading users…" />
        ) : users.error ? (
          <ErrorState message={users.error} onRetry={users.refetch} />
        ) : !list || list.length === 0 ? (
          <EmptyState message="No users yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 font-medium">Email</th>
                  <th className="pb-2 pr-4 font-medium">Role</th>
                  <th className="pb-2 font-medium">Assigned therapist</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {list.map((u) => (
                  <tr key={u.id}>
                    <td className="py-3 pr-4 text-white">{u.full_name || "—"}</td>
                    <td className="py-3 pr-4 text-slate-400">{u.email}</td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full border px-2.5 py-1 text-xs capitalize ${ROLE_BADGE[u.role]}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3">
                      {u.role === "patient" && u.patient_profile_id ? (
                        <AssignSelect
                          value={u.therapist_id}
                          therapists={therapists.data ?? []}
                          disabled={saving === u.patient_profile_id}
                          onChange={(tid) => assign(u.patient_profile_id!, tid)}
                        />
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AssignSelect({
  value,
  therapists,
  disabled,
  onChange,
}: {
  value: string | null;
  therapists: TherapistOption[];
  disabled: boolean;
  onChange: (therapistId: string | null) => void;
}) {
  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-teal-700 disabled:opacity-50"
    >
      <option value="">Unassigned</option>
      {therapists.map((t) => (
        <option key={t.therapist_id} value={t.therapist_id}>
          {t.name} ({t.patient_count})
        </option>
      ))}
    </select>
  );
}

function OverviewTile({
  icon,
  label,
  value,
  warn,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
  warn?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className={warn ? "text-amber-400" : "text-teal-400"}>{icon}</div>
      <p className="mt-3 text-xs text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${warn ? "text-amber-300" : "text-white"}`}>
        {value ?? "—"}
      </p>
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <RequireAuth roles={["admin"]}>
      <AdminDashboardInner />
    </RequireAuth>
  );
}
