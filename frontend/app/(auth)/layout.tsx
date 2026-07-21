import { Activity } from "lucide-react";

// Auth Mode: the common landing shell for signed-out visitors. No sidebar or
// navbar — those belong to the dashboard, which requires a session. Styled to
// match the dashboard hero: slate depth, teal glow, generous radii.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-12">
      {/* Layered background, mirroring the dashboard hero. */}
      <div className="absolute inset-0 bg-gradient-to-br from-teal-900/40 via-slate-950 to-slate-950" />
      <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-teal-500/20 blur-3xl" />
      <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-teal-500/10 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/10 ring-1 ring-teal-700/50">
            <Activity size={24} className="text-teal-400" />
          </div>
          <h1 className="text-2xl font-semibold text-white">AI Physio</h1>
          <p className="mt-1 text-sm text-slate-400">Rehabilitation Assistant</p>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-slate-950/50 backdrop-blur">
          {children}
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          Camera-based movement tracking and real-time clinical feedback.
        </p>
      </div>
    </div>
  );
}
